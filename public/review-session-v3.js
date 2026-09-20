(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before review-session-v3.js");

  const KEY="lexiflow-review-session-v3";
  let data=null;
  let busy=false;
  let renderQueued=false;

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const norm=value=>String(value||"").trim().toLowerCase().replace(/[’‘]/g,"'").replace(/^[\s.,!?;:()\[\]{}"']+|[\s.,!?;:()\[\]{}"']+$/g,"").replace(/\s+/g," ");
  const clone=value=>JSON.parse(JSON.stringify(value));
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`review-v3-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today=()=>core.dayKey(new Date());

  function loadSession(){
    try{
      const value=JSON.parse(localStorage.getItem(KEY)||"null");
      return value&&typeof value==="object"?value:null;
    }catch{return null;}
  }
  function saveSession(session){
    try{
      if(session)localStorage.setItem(KEY,JSON.stringify({...session,updatedAt:new Date().toISOString()}));
      else localStorage.removeItem(KEY);
    }catch{}
  }

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      data=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return data;
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }

  async function persist(next){
    const normalized=core.normalizeData(next);
    const response=await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:normalized,reviewAuthority:"v3"}),
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
    if(!syncFromGateway())data=normalized;
  }

  function cardById(id){return data?.cards?.find(card=>card.id===id)||null;}
  function plannedQueue(){
    const plan=data?.dailyPlan;
    if(!plan||plan.date!==today()||plan.frozen!==true||!Array.isArray(plan.review))return[];
    // Frozen DailyPlan membership is authoritative. Review V4 may deliberately
    // pull Stable maintenance slightly forward inside its safe window, so the
    // session must not re-run an `isDue()` gate and silently drop planned work.
    return plan.review.filter(id=>{
      const card=cardById(id);
      return card&&core.canonicalStage(card)==="review";
    });
  }

  function validSession(session){
    return session&&session.date===today()&&Array.isArray(session.queue)&&Array.isArray(session.repairTail);
  }

  function freshSession(){
    const queue=plannedQueue();
    return {
      version:3,date:today(),queue,cursor:0,phase:"normal",repairTail:[],repairCursor:0,
      repairTypeByCard:{},active:null,paused:false,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    };
  }

  function reconcile(session){
    if(!validSession(session))session=freshSession();
    const available=new Set((data?.cards||[]).filter(card=>card.stage==="review").map(card=>card.id));
    session.queue=(session.queue||[]).filter(id=>available.has(id));
    session.repairTail=[...new Set((session.repairTail||[]).filter(id=>available.has(id)))];
    session.repairTypeByCard=session.repairTypeByCard&&typeof session.repairTypeByCard==="object"?session.repairTypeByCard:{};
    for(const id of Object.keys(session.repairTypeByCard))if(!session.repairTail.includes(id))delete session.repairTypeByCard[id];
    session.cursor=Math.max(0,Math.min(Number(session.cursor||0),session.queue.length));
    session.repairCursor=Math.max(0,Math.min(Number(session.repairCursor||0),session.repairTail.length));
    if(session.phase!=="repair")session.phase="normal";
    if(session.phase==="normal"&&session.cursor>=session.queue.length&&session.repairTail.length){
      session.phase="repair";
      session.repairCursor=Math.min(session.repairCursor,session.repairTail.length);
      session.active=null;
    }
    return session;
  }

  function currentId(session){return session.phase==="repair"?session.repairTail[session.repairCursor]||"":session.queue[session.cursor]||"";}
  function isFinished(session){return session.phase==="repair"?session.repairCursor>=session.repairTail.length:session.cursor>=session.queue.length&&!session.repairTail.length;}

  function enabledTypes(card){
    const out=[{type:"en-zh",weight:30},{type:"zh-en",weight:50}];
    if(card.imageData||card.imageUrl)out.push({type:"image-en",weight:20});
    return out;
  }

  function hashSeed(value){
    let h=2166136261;
    for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return h>>>0;
  }

  function weightedType(options,seed){
    const total=options.reduce((sum,item)=>sum+item.weight,0);
    let target=hashSeed(seed)%Math.max(1,total);
    for(const item of options){if(target<item.weight)return item.type;target-=item.weight;}
    return options[0]?.type||"en-zh";
  }

  function typeFor(card,session){
    const all=enabledTypes(card);
    let options=all;
    if(session.phase==="repair"){
      const failed=String(session.repairTypeByCard?.[card.id]||"");
      const alternates=all.filter(item=>item.type!==failed);
      if(failed&&alternates.length)options=alternates;
    }
    return weightedType(options,`${card.id}:${Number(card.reviewCount||0)}:${today()}:${session.phase}`);
  }

  function activeFor(card,session){
    const active=session.active;
    if(active&&active.cardId===card.id&&Number(active.reviewCount)===Number(card.reviewCount||0))return active;
    session.active={cardId:card.id,reviewCount:Number(card.reviewCount||0),type:typeFor(card,session),revealed:false,draft:"",checked:false,correct:null,phase:session.phase,createdAt:new Date().toISOString()};
    saveSession(session);
    return session.active;
  }

  function reviewKind(card,now){
    if(card.memoryState==="review_again")return card.reviewAgainFailedOn===core.dayKey(now)?"same-day-repair":"next-day-validation";
    return card.memoryState==="stable"?"stable-maintenance":"scheduled";
  }

  function progress(session){
    const normal=session.queue.length,repairs=session.repairTail.length,total=Math.max(1,normal+repairs);
    const current=session.phase==="repair"?normal+Math.min(session.repairCursor+1,repairs):Math.min(session.cursor+1,normal||1);
    return{current,total};
  }

  function injectStyle(){
    if(document.getElementById("lexi-review-v3-style"))return;
    const style=document.createElement("style");style.id="lexi-review-v3-style";
    style.textContent=`.lexi-r3-screen{min-height:100vh;background:var(--bg);padding:26px}.lexi-r3-shell{width:min(900px,100%);margin:0 auto}.lexi-r3-top{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.lexi-r3-top-left{display:grid;gap:4px}.lexi-r3-top-left strong{font-size:15px}.lexi-r3-top-left span{font-size:12px;color:var(--muted)}.lexi-r3-card{width:min(660px,100%);margin:34px auto 0;padding:34px;border:1px solid var(--line);border-radius:24px;background:var(--surface);box-shadow:var(--shadow-sm,0 8px 30px rgba(34,48,43,.04));display:grid;gap:22px;text-align:center}.lexi-r3-kicker{font-size:12px;font-weight:800;letter-spacing:.1em;color:var(--muted)}.lexi-r3-word-line{display:flex;align-items:center;justify-content:center;gap:10px}.lexi-r3-word{font-size:42px;font-weight:800;line-height:1.12}.lexi-r3-phonetic{color:var(--muted);font-size:13px}.lexi-r3-example{display:flex;align-items:center;justify-content:center;gap:9px;color:var(--muted);font-size:13px}.lexi-r3-meaning{font-size:30px;font-weight:760;line-height:1.4}.lexi-r3-meta{color:var(--muted);font-size:13px}.lexi-r3-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.lexi-r3-input{display:flex;gap:10px;width:min(560px,100%);margin:0 auto}.lexi-r3-input input{flex:1;min-width:0;text-align:center;font-size:18px}.lexi-r3-input .btn{flex:0 0 auto;min-width:116px;white-space:nowrap;padding-inline:18px}.lexi-r3-result{border-top:1px solid var(--line);padding-top:20px;display:grid;gap:12px}.lexi-r3-result strong{font-size:20px}.lexi-r3-result span{color:var(--muted);font-size:13px}.lexi-r3-image{width:min(390px,82vw);aspect-ratio:4/3;object-fit:cover;border-radius:18px;border:1px solid var(--line);margin:0 auto}.lexi-r3-empty{width:min(620px,100%);margin:70px auto;padding:30px;text-align:center}.lexi-r3-error{width:min(620px,100%);margin:70px auto;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--surface);display:grid;gap:12px}@media(max-width:700px){.lexi-r3-screen{padding:18px 14px}.lexi-r3-card{padding:24px 18px;margin-top:20px}.lexi-r3-input{flex-direction:column}.lexi-r3-input .btn{width:100%}.lexi-r3-word{font-size:35px}.lexi-r3-meaning{font-size:25px}}`;
    document.head.appendChild(style);
  }

  function sessionFrame(inner,session){
    const p=progress(session),phase=session.phase==="repair"?"再巩固一次":"今日复习";
    return `<div class="lexi-r3-screen"><div class="lexi-r3-shell"><div class="lexi-r3-top"><div class="lexi-r3-top-left"><strong>${phase}</strong><span>${p.current} / ${p.total} · 今天安排的复习</span></div><button class="btn" type="button" data-r3="pause">退出复习</button></div>${inner}</div></div>`;
  }

  function answerMeta(card){const phonetic=String(card.phonetic||"").trim();return `${phonetic?esc(phonetic):"暂无音标"} · ${esc(card.meaningZh||"")}`;}
  const morphologyBlock = card => window.LexiFlowMorphologyViewV1?.markup?.(card?.morphology)||"";

  function renderCard(card,session){
    const active=activeFor(card,session),kind=reviewKind(card,new Date());
    let body="";
    if(active.type==="en-zh"){
      body=`<div class="lexi-r3-kicker">英文 → 中文 · 主动回忆</div><div class="lexi-r3-word-line"><div class="lexi-r3-word">${esc(card.word)}</div><button class="speaker lexi-r3-speaker" type="button" data-r3="speak" title="播放美式发音" aria-label="播放当前单词的发音">🔊</button></div><div class="lexi-r3-phonetic">${answerMeta(card).split(" · ")[0]}</div><div class="lexi-r3-meta">先在脑中说出当前词义，再查看答案。</div>${active.revealed?`<div class="lexi-r3-result"><strong>${esc(card.meaningZh||"")}</strong>${morphologyBlock(card)}${card.exampleEn?`<div class="lexi-r3-example"><span>${esc(card.exampleEn)}</span><button class="sentence-speaker" type="button" data-r3="speak-example" title="播放例句" aria-label="播放例句">🔊</button></div>`:""}<div class="lexi-r3-actions"><button class="btn" type="button" data-r3="rate" data-quality="again">没想起来</button><button class="btn primary" type="button" data-r3="rate" data-quality="good">我想起来了</button></div></div>`:`<div class="lexi-r3-actions"><button class="btn primary" type="button" data-r3="reveal">查看答案</button></div>`}`;
    }else{
      const prompt=active.type==="image-en"?`<div class="lexi-r3-kicker">图片 → 英文 · 主动回忆</div><img class="lexi-r3-image" src="${esc(card.imageData||card.imageUrl||"")}" alt="联想图"/>`:`<div class="lexi-r3-kicker">中文 → 英文 · 主动回忆</div><div class="lexi-r3-meaning">${esc(card.meaningZh||"")}</div>`;
      const failLabel=kind==="next-day-validation"?"没记住，明天再练":"没记住，进入修复";
      body=`${prompt}<div class="lexi-r3-meta">不要先看答案，直接把英文完整输入出来。</div><div class="lexi-r3-input"><input id="lexi-r3-answer" class="input" autocomplete="off" spellcheck="false" value="${esc(active.draft||"")}" ${active.checked?"readonly":""}/>${active.checked?"":`<button class="btn primary" type="button" data-r3="check">提交答案</button>`}</div>${active.checked?`<div class="lexi-r3-result"><strong>${active.correct?"主动回忆成功":"这次没有完整想起来"}</strong><span>正确答案：${esc(card.word)} · ${answerMeta(card)}</span>${morphologyBlock(card)}<div class="lexi-r3-actions"><button class="btn primary" type="button" data-r3="rate" data-quality="${active.correct?"good":"again"}">${active.correct?"记住了，继续":failLabel}</button><button class="speaker lexi-r3-speaker" type="button" data-r3="speak" title="播放美式发音" aria-label="播放当前单词的发音">🔊</button></div></div>`:""}`;
    }
    return sessionFrame(`<section class="lexi-r3-card" data-r3-card="${esc(card.id)}">${body}</section>`,session);
  }

  function renderError(message){const app=document.getElementById("app");if(app)app.innerHTML=`<div class="lexi-r3-screen"><div class="lexi-r3-error"><strong>复习没有正常打开</strong><span>${esc(message||"请返回后重试。")}</span><button class="btn" type="button" data-r3="reload">返回</button></div></div>`;}
  function finishSession(){saveSession(null);location.reload();}

  function renderSession(){
    const app=document.getElementById("app");if(!app||!data)return;
    let session=reconcile(loadSession());
    if(!session.queue.length&&session.phase==="normal"){
      saveSession(null);
      app.innerHTML=`<div class="lexi-r3-screen"><div class="lexi-r3-empty"><strong>今天没有需要复习的内容</strong><p>需要巩固的词会由系统自动安排，你不需要手动管理复习日期。</p><button class="btn" type="button" data-r3="reload">返回今日学习</button></div></div>`;
      return;
    }
    if(isFinished(session)){finishSession();return;}
    const id=currentId(session),card=cardById(id);
    if(!card){if(session.phase==="repair")session.repairCursor++;else session.cursor++;session.active=null;saveSession(session);renderSession();return;}
    session.paused=false;saveSession(session);app.innerHTML=renderCard(card,session);
    if(session.active?.type!=="en-zh"&&!session.active?.checked)requestAnimationFrame(()=>document.getElementById("lexi-r3-answer")?.focus());
  }

  async function openSession({resume=true}={}){
    if(busy)return;busy=true;
    try{injectStyle();await refresh();let session=resume?loadSession():null;if(!validSession(session))session=freshSession();session=reconcile(session);session.paused=false;saveSession(session);renderSession();}
    catch(err){console.error("Review V3 start failed",err);renderError("学习数据暂时无法读取，请稍后重试。");}
    finally{busy=false;}
  }

  function isSameDayRepair(card,now){return card?.memoryState==="review_again"&&card?.reviewAgainFailedOn===core.dayKey(now);}

  async function commitRating(quality){
    if(busy||!["good","again"].includes(quality))return;
    busy=true;
    try{
      let session=reconcile(loadSession());
      await refresh();session=reconcile(session);
      const id=currentId(session),card=cardById(id);if(!card)throw new Error("CARD_NOT_FOUND");
      const active=session.active;
      const baseline=Number(active?.reviewCount??card.reviewCount??0);

      if(Number(card.reviewCount||0)<=baseline){
        const now=new Date(),prev=clone(card),repair=isSameDayRepair(prev,now)||session.phase==="repair",kind=reviewKind(prev,now);
        const patch=core.reviewSchedulePatch(prev,quality,now);if(!patch)throw new Error("REVIEW_PATCH_FAILED");
        card.reviewCount=Number(card.reviewCount||0)+1;card.lastReviewedAt=now.toISOString();card.initialReviewPending=false;Object.assign(card,patch);card.updatedAt=now.toISOString();
        data.activities=Array.isArray(data.activities)?data.activities:[];
        data.activities.push({id:uid(),type:"review",cardId:card.id,quality,kind,questionType:String(active?.type||""),reviewStepBefore:Number(prev.reviewStep||0),reviewStepAfter:Number(card.reviewStep||0),memoryStateBefore:String(prev.memoryState||"reinforcing"),memoryStateAfter:String(card.memoryState||"reinforcing"),reviewCountAfter:Number(card.reviewCount||0),at:now.toISOString(),authority:"review-session-v3"});
        data.dailyPlan=core.buildDailyPlan(data,now);
        const mayRepairToday=kind==="scheduled"||kind==="stable-maintenance";
        await persist(data);
        if(quality==="again"&&mayRepairToday&&!repair){
          if(!session.repairTail.includes(card.id))session.repairTail.push(card.id);
          session.repairTypeByCard=session.repairTypeByCard&&typeof session.repairTypeByCard==="object"?session.repairTypeByCard:{};
          session.repairTypeByCard[card.id]=String(active?.type||"");
        }
      }

      if(session.phase==="repair")session.repairCursor++;else session.cursor++;
      session.active=null;
      if(session.phase==="normal"&&session.cursor>=session.queue.length&&session.repairTail.length){session.phase="repair";session.repairCursor=0;}
      saveSession(session);
      if(isFinished(session)){finishSession();return;}
      renderSession();
    }catch(err){console.error("Review V3 save failed",err);renderError("这次结果还没有保存，请返回后重试，LexiFlow 不会自动算作完成。");}
    finally{busy=false;}
  }

  async function speakCurrent(){
    const session=reconcile(loadSession()),card=cardById(currentId(session));if(!card)return;
    try{
      const pronunciation=window.LexiFlowPronunciationV3;
      if(typeof pronunciation?.playWord==="function"){
        await pronunciation.playWord(card.word,{audioUrl:card.audioUrl||"",audioUrls:Array.isArray(card.audioUrls)?card.audioUrls:[]});
        return;
      }
      if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.word);
    }catch{}
  }

  async function speakExample(){
    const session=reconcile(loadSession()),card=cardById(currentId(session));if(!card?.exampleEn)return;
    try{
      const pronunciation=window.LexiFlowPronunciationV3;
      if(typeof pronunciation?.playSentence==="function")await pronunciation.playSentence(card.exampleEn);
      else if(typeof window.LexiFlowNaturalTts?.play==="function")await window.LexiFlowNaturalTts.play(card.exampleEn);
    }catch{}
  }

  document.addEventListener("click",event=>{
    const start=event.target?.closest?.('[data-action="start-review"]');
    if(start){event.preventDefault();event.stopImmediatePropagation();void openSession({resume:true});return;}
    const button=event.target?.closest?.("[data-r3]");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const action=button.dataset.r3;
    if(action==="reload"){location.reload();return;}
    if(action==="pause"){const session=loadSession();if(session){session.paused=true;saveSession(session);}location.reload();return;}
    if(action==="speak"){void speakCurrent();return;}
    if(action==="speak-example"){void speakExample();return;}
    const session=reconcile(loadSession()),card=cardById(currentId(session));if(!card)return;
    const active=activeFor(card,session);
    if(action==="reveal"){active.revealed=true;session.active=active;saveSession(session);renderSession();return;}
    if(action==="check"){
      const input=document.getElementById("lexi-r3-answer"),value=String(input?.value||active.draft||"").trim();if(!value){input?.focus();return;}
      active.draft=value;active.checked=true;active.correct=norm(value)===norm(card.word);session.active=active;saveSession(session);renderSession();return;
    }
    if(action==="rate")void commitRating(String(button.dataset.quality||""));
  },true);

  document.addEventListener("input",event=>{
    if(event.target?.id!=="lexi-r3-answer")return;
    const session=reconcile(loadSession()),card=cardById(currentId(session));if(!card)return;
    const active=activeFor(card,session);active.draft=event.target.value;session.active=active;saveSession(session);
  },true);

  document.addEventListener("keydown",event=>{if(event.target?.id==="lexi-r3-answer"&&event.key==="Enter"&&!event.isComposing){event.preventDefault();document.querySelector('[data-r3="check"]')?.click();}},true);

  function maybeResume(){
    const session=loadSession();if(!validSession(session)||session.paused)return;
    if(isFinished(session)){saveSession(null);return;}
    const home=Array.from(document.querySelectorAll("h1,h2")).some(node=>node.textContent.trim()==="今日学习");if(home)void openSession({resume:true});
  }
  function scheduleResume(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;maybeResume();});}

  window.LexiFlowReviewSessionV3=Object.freeze({open(){return openSession({resume:true});},restart(){return openSession({resume:false});}});

  function start(){injectStyle();const app=document.getElementById("app");if(app)new MutationObserver(scheduleResume).observe(app,{childList:true,subtree:true});setTimeout(maybeResume,500);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
