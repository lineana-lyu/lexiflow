(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before memorize-v2.js");
  const KEY = "lexiflow-memorize-v2";
  let data = null;
  let queued = false;
  let saving = false;

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `mem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = v => String(v||"").trim().toLowerCase().replace(/[’‘]/g,"'").replace(/^[\s.,!?;:()\[\]{}"']+|[\s.,!?;:()\[\]{}"']+$/g,"").replace(/\s+/g," ");
  const phonetic = v => { const s=String(v||"").trim(); return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`; };

  function loadAll(){
    try{ const x=JSON.parse(localStorage.getItem(KEY)||"{}"); return x&&typeof x==="object"?x:{}; }catch{return {};}
  }
  function getSession(id){ return loadAll()[id]||null; }
  function setSession(id, value){ const all=loadAll(); all[id]={...value,updatedAt:new Date().toISOString()}; try{localStorage.setItem(KEY,JSON.stringify(all));}catch{} }
  function clearSession(id){ const all=loadAll(); delete all[id]; try{localStorage.setItem(KEY,JSON.stringify(all));}catch{} }

  async function refresh(){
    try{
      const r=await fetch("/api/learning-data",{cache:"no-store"});
      if(r.ok){ const p=await r.json(); if(p?.data?.cards) data=core.normalizeData(p.data); }
    }catch{}
    return data;
  }
  async function save(next){
    const r=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:core.normalizeData(next)})});
    if(!r.ok) throw new Error("SAVE_FAILED");
  }

  function currentCard(){
    if(!data?.cards)return null;
    const activeId=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!activeId)return null;
    const card=data.cards.find(item=>item.id===activeId)||null;
    return card&&core.canonicalStage(card)==="memorize"?card:null;
  }

  function commandId(cardId,now=new Date()){
    return `stage:${core.dayKey(now)}:${String(cardId)}:memorize`;
  }
  function commandCommitted(value,id){
    return Array.isArray(value?.activities)&&value.activities.some(item=>String(item.commandId||"")===id);
  }

  function freshSession(card){
    const round=Math.max(1,Math.min(2,Number(card.memorizeRound||1)));
    return {round,direction:"en-zh",phase:"test",revealed:false,draft:"",checked:false,correct:null,results:{1:{en:null,zh:null},2:{en:null,zh:null}}};
  }
  function session(card){
    const saved=getSession(card.id), base=freshSession(card);
    if(!saved)return base;
    return {...base,...saved,results:{1:{...base.results[1],...(saved.results?.[1]||saved.results?.["1"]||{})},2:{...base.results[2],...(saved.results?.[2]||saved.results?.["2"]||{})}}};
  }

  const wordBlock = c => `<div class="lexi-m2-word" data-lexi-mem-word="${esc(c.word)}"><div><strong>${esc(c.word)}</strong><button type="button" data-m2="speak">🔊</button></div><small>${esc(phonetic(c.phonetic))} · ${esc(c.pos||"")}</small></div>`;
  const example = c => `<div class="lexi-m2-example"><small>例句</small><div>${esc(c.exampleEn||"")}</div><p>${esc(c.exampleZh||"")}</p></div>`;
  const head = s => `<div class="lexi-m2-head"><strong>记忆 · 第 ${s.round} 轮 / 2</strong><span>${s.round===1?"双向主动回忆":"最后一轮强化，不无限重复"}</span></div>`;

  function html(card,s){
    if(s.phase==="reinforce"){
      return `${head(s)}<div class="lexi-m2-center"><div class="lexi-m2-direction">短暂强化</div><p>第一轮至少有一个方向没有成功。完整看一次词义、拼写和例句，然后只再测一轮。</p><div class="lexi-m2-card">${wordBlock(card)}<strong>${esc(card.meaningZh)}</strong>${example(card)}</div><button class="btn primary" type="button" data-m2="round2">开始第 2 轮</button></div>`;
    }
    if(s.direction==="zh-en"){
      return `${head(s)}<div class="lexi-m2-center"><div class="lexi-m2-direction">中 → 英</div><div class="lexi-m2-meaning">${esc(card.meaningZh)}</div><p>必须把英文完整输入出来，再检查答案。</p><div class="lexi-m2-input"><input id="lexi-m2-answer" class="input" value="${esc(s.draft||"")}" autocomplete="off" spellcheck="false" ${s.checked?"readonly":""}/>${s.checked?"":`<button class="btn primary" type="button" data-m2="check">提交答案</button>`}</div>${s.checked?`<div class="lexi-m2-card"><strong>${s.correct?"答对了":"这次没有完整想起来"}</strong><span>${s.correct?`你主动写出了 “${esc(card.word)}”。`:`正确答案是 “${esc(card.word)}”。`}</span>${wordBlock(card)}${example(card)}</div><button class="btn primary" type="button" data-m2="continue">继续</button>`:""}</div>`;
    }
    return `${head(s)}<div class="lexi-m2-center"><div class="lexi-m2-direction">英 → 中</div>${wordBlock(card)}<p>先在脑中说出当前词义，再查看答案。看着眼熟不算主动记住。</p>${s.revealed?`<div class="lexi-m2-card"><strong>${esc(card.meaningZh)}</strong>${example(card)}</div><div class="lexi-m2-actions"><button class="btn" type="button" data-m2="rate" data-ok="0">没想起来</button><button class="btn primary" type="button" data-m2="rate" data-ok="1">我想起来了</button></div>`:`<button class="btn primary" type="button" data-m2="reveal">查看答案</button>`}</div>`;
  }

  function style(){
    if(document.getElementById("lexi-m2-style"))return;
    const el=document.createElement("style"); el.id="lexi-m2-style";
    el.textContent=`.lexi-m2{min-height:500px;padding:4px}.lexi-m2-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.lexi-m2-head span,.lexi-m2-center>p{color:var(--muted);font-size:13px}.lexi-m2-center{width:min(640px,100%);margin:34px auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px}.lexi-m2-direction{font-size:13px;font-weight:700;color:var(--muted);letter-spacing:.08em}.lexi-m2-word>div{display:flex;align-items:center;justify-content:center;gap:8px}.lexi-m2-word strong{font-size:40px}.lexi-m2-word button{border:0;background:transparent;cursor:pointer;font-size:19px}.lexi-m2-word small{color:var(--muted)}.lexi-m2-meaning{font-size:30px;font-weight:750}.lexi-m2-card{width:min(540px,100%);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px;background:var(--surface)}.lexi-m2-card>strong{font-size:21px}.lexi-m2-card>span{color:var(--muted)}.lexi-m2-example{padding-top:12px;border-top:1px solid var(--line);text-align:left;font-size:14px;line-height:1.65}.lexi-m2-example small,.lexi-m2-example p{color:var(--muted)}.lexi-m2-example p{margin:4px 0 0}.lexi-m2-input{display:flex;gap:10px;width:min(500px,100%)}.lexi-m2-input input{text-align:center;font-size:18px}.lexi-m2-actions{display:flex;gap:10px;width:min(420px,100%)}.lexi-m2-actions .btn{flex:1}@media(max-width:700px){.lexi-m2-input{flex-direction:column}.lexi-m2-word strong{font-size:34px}}`;
    document.head.appendChild(el);
  }

  function render(){
    const host=document.querySelector(".study-card-focus"); if(!host)return;
    const card=currentCard(); if(!card||core.canonicalStage(card)!=="memorize")return;
    const s=session(card);
    const key=`${card.id}:${s.round}:${s.direction}:${s.phase}:${s.revealed?1:0}:${s.checked?1:0}:${s.correct===true?1:s.correct===false?0:"n"}`;
    if(host.dataset.lexiM2===key)return;
    host.dataset.lexiM2=key;
    host.innerHTML=`<div class="lexi-m2" data-lexi-mem-word="${esc(card.word)}">${html(card,s)}<div style="margin-top:24px;text-align:center;color:var(--muted);font-size:12px">本轮进度保存在本机，退出后会从这里继续。</div></div>`;
    if(s.direction==="zh-en"&&!s.checked)requestAnimationFrame(()=>document.getElementById("lexi-m2-answer")?.focus());
  }

  async function complete(card,s){
    if(saving)return;
    saving=true;
    try{
      await refresh();
      const c=data?.cards?.find(x=>x.id===card.id); if(!c)return;
      const now=new Date(),cmd=commandId(c.id,now);
      if(commandCommitted(data,cmd)){clearSession(card.id);location.reload();return;}
      if(core.canonicalStage(c)!=="memorize"){clearSession(card.id);location.reload();return;}

      const round1=s.results?.[1]||{}, final=s.results?.[s.round]||{};
      const initialWeak=!(round1.en===true&&round1.zh===true);
      const finalRoundPassed=final.en===true&&final.zh===true;
      const prev={...c,learningStage:"memorize"};
      c.stage="visualize";
      c.learningStage="visualize";
      Object.assign(c,core.crossDayPatch(prev,{stage:"visualize",learningStage:"visualize"},now)||{});
      c.memorizeRound=s.round;
      c.initialMemoryWeak=initialWeak;
      c.updatedAt=now.toISOString();
      c.memoryHistory=Array.isArray(c.memoryHistory)?c.memoryHistory:[];
      c.memoryHistory.push({stage:"memorize",round:s.round,enToZh:final.en===true,zhToEn:final.zh===true,initialMemoryWeak:initialWeak,finalRoundPassed,at:now.toISOString()});
      data.activities=Array.isArray(data.activities)?data.activities:[];
      data.activities.push({id:uid(),type:"stage-complete",cardId:c.id,stage:"memorize",round:s.round,initialMemoryWeak:initialWeak,finalRoundPassed,commandId:cmd,at:now.toISOString()});
      await save(data);
      clearSession(card.id);
      location.reload();
    }catch(err){
      console.error("memorize completion failed",err);
      saving=false;
      window.alert("记忆阶段没有保存成功，请重试。当前这一轮的答案仍保留在本机。");
    }
  }

  async function act(btn){
    const card=currentCard(); if(!card)return; const s=session(card), a=btn.dataset.m2;
    if(a==="speak"){ try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}; try{const u=new SpeechSynthesisUtterance(card.word);u.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}; return; }
    if(saving)return;
    if(a==="reveal"){s.revealed=true;setSession(card.id,s);render();return;}
    if(a==="rate"){s.results[s.round].en=btn.dataset.ok==="1";s.direction="zh-en";s.revealed=false;s.draft="";s.checked=false;s.correct=null;setSession(card.id,s);render();return;}
    if(a==="check"){const input=document.getElementById("lexi-m2-answer"),v=String(input?.value||s.draft||"").trim();if(!v){input?.focus();return;}s.draft=v;s.checked=true;s.correct=norm(v)===norm(card.word);s.results[s.round].zh=s.correct;setSession(card.id,s);render();return;}
    if(a==="continue"){const r=s.results[s.round],pass=r.en===true&&r.zh===true;if(s.round===1&&!pass){s.phase="reinforce";s.direction="en-zh";s.revealed=false;s.checked=false;setSession(card.id,s);render();return;}await complete(card,s);return;}
    if(a==="round2"){s.round=2;s.phase="test";s.direction="en-zh";s.revealed=false;s.draft="";s.checked=false;s.correct=null;setSession(card.id,s);render();}
  }

  document.addEventListener("click",e=>{
    const b=e.target?.closest?.("[data-m2]");
    if(b){e.preventDefault();e.stopImmediatePropagation();void act(b);}
  },true);
  document.addEventListener("input",e=>{if(e.target?.id!=="lexi-m2-answer")return;const c=currentCard();if(!c)return;const s=session(c);s.draft=e.target.value;setSession(c.id,s);},true);
  document.addEventListener("keydown",e=>{if(e.target?.id==="lexi-m2-answer"&&e.key==="Enter"&&!e.isComposing){e.preventDefault();document.querySelector('[data-m2="check"]')?.click();}},true);

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();render();});}
  function start(){const app=document.getElementById("app");if(!app)return;style();void refresh().then(render);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();