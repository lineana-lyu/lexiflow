(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before apply-stage-v3.js");

  let data=null;
  let queued=false;
  let refreshing=false;
  const sessions=new Map();

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const norm=value=>String(value||"").trim();
  const copyNorm=value=>norm(value).toLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[.,!?;:()[\]{}"']/g," ").replace(/\s+/g," ").trim();
  const phonetic=value=>{const s=norm(value);return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`;};
  const escapeRe=value=>String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

  function targetForms(word){
    const w=norm(word).toLowerCase();if(!w)return[];
    if(w.includes(" "))return[w];
    const set=new Set([w]);
    if(w.endsWith("y")&&w.length>2){set.add(`${w.slice(0,-1)}ies`);set.add(`${w.slice(0,-1)}ied`);}
    if(w.endsWith("e")){set.add(`${w}s`);set.add(`${w}d`);set.add(`${w.slice(0,-1)}ing`);}else{set.add(`${w}s`);set.add(`${w}es`);set.add(`${w}ed`);set.add(`${w}ing`);}
    const irregular={keep:["kept"],run:["ran","running"],write:["wrote","written","writing"],go:["went","gone"],have:["has","had"],do:["does","did","done"],make:["made"],take:["took","taken"],see:["saw","seen"],come:["came"],get:["got","gotten"],give:["gave","given"],eat:["ate","eaten"],buy:["bought"],bring:["brought"],think:["thought"],say:["said"]};
    (irregular[w]||[]).forEach(item=>set.add(item));return[...set];
  }
  function usesTarget(text,word){
    const value=String(text||"");const target=norm(word).toLowerCase();if(!target)return false;
    if(target.includes(" "))return value.toLowerCase().includes(target);
    return targetForms(target).some(form=>new RegExp(`\\b${escapeRe(form)}\\b`,"i").test(value));
  }

  async function loadData(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }
  async function refresh(){if(refreshing)return data;refreshing=true;try{return await loadData();}catch{return data;}finally{refreshing=false;}}
  async function persist(next){
    const normalized=core.normalizeData(next);
    const response=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:normalized})});
    if(!response.ok)throw new Error("SAVE_FAILED");
    data=normalized;return normalized;
  }

  function currentCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function currentCard(){
    const id=currentCardId();if(!id||!Array.isArray(data?.cards))return null;
    const card=data.cards.find(item=>String(item.id)===id)||null;
    return card&&core.canonicalStage(card)==="apply"?card:null;
  }
  function session(card){
    let value=sessions.get(card.id);
    if(!value){value={text:String(card.applyDraft||card.userSentence||""),feedback:null,submitting:false,originalText:"",approved:false,suggestionApproved:false,promptLoading:false};sessions.set(card.id,value);}
    return value;
  }

  function injectStyle(){
    if(document.getElementById("lexi-apply-stage-v3-style"))return;
    const style=document.createElement("style");style.id="lexi-apply-stage-v3-style";
    style.textContent=`
      .lexi-apply-stage-v3{min-height:500px;padding:4px;display:grid;gap:18px}.lexi-apply-v3-head{text-align:center;display:grid;gap:6px}.lexi-apply-v3-word{display:flex;align-items:center;justify-content:center;gap:9px}.lexi-apply-v3-word strong{font-size:40px;line-height:1.1}.lexi-apply-v3-word button{border:0;background:transparent;cursor:pointer;font-size:19px}.lexi-apply-v3-meta{font-size:13px;color:var(--muted)}.lexi-apply-v3-meaning{font-size:17px;font-weight:750}.lexi-apply-v3-prompt{width:min(700px,100%);margin:0 auto;padding:13px 15px;border-radius:15px;background:rgba(120,140,132,.05);display:flex;align-items:center;justify-content:space-between;gap:14px}.lexi-apply-v3-prompt div{display:grid;gap:3px}.lexi-apply-v3-prompt small{color:var(--muted)}.lexi-apply-v3-composer{width:min(700px,100%);margin:0 auto}.lexi-apply-v3-composer textarea{min-height:125px;font-size:16px;line-height:1.7}.lexi-apply-v3-composer-bottom{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:9px}.lexi-apply-v3-composer-bottom span{font-size:11px;color:var(--muted)}.lexi-apply-v3-warning{width:min(700px,100%);margin:0 auto;padding:10px 12px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:12px;line-height:1.6}.lexi-apply-v3-feedback{width:min(700px,100%);margin:0 auto;border:1px solid var(--line);border-radius:18px;padding:16px;display:grid;gap:12px;background:var(--surface)}.lexi-apply-v3-feedback.good{background:rgba(78,128,103,.045)}.lexi-apply-v3-feedback-head{display:flex;justify-content:space-between;gap:12px}.lexi-apply-v3-feedback-head div{display:grid;gap:2px}.lexi-apply-v3-feedback-head small{color:var(--muted)}.lexi-apply-v3-suggestion{font-size:16px;line-height:1.7;padding:12px;border-radius:13px;background:rgba(120,140,132,.05)}.lexi-apply-v3-tips{display:grid;gap:6px;color:var(--muted);font-size:13px}.lexi-apply-v3-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.lexi-apply-stage-v3 .lexi-apply-actions-v3{width:min(700px,100%);margin:0 auto!important}.lexi-apply-v3-undo{width:min(700px,100%);margin:0 auto;text-align:left}@media(max-width:700px){.lexi-apply-v3-prompt{align-items:flex-start;flex-direction:column}.lexi-apply-v3-composer-bottom{align-items:stretch;flex-direction:column}.lexi-apply-v3-composer-bottom .btn{width:100%}.lexi-apply-v3-actions .btn{flex:1}}
    `;document.head.appendChild(style);
  }

  function feedbackHtml(card,s){
    if(s.submitting)return `<div class="lexi-apply-v3-feedback"><div class="lexi-apply-v3-feedback-head"><div><small>正在检查</small><strong>AI 正在检查你的表达</strong></div><span class="mini-spinner"></span></div><div style="color:var(--muted);font-size:13px">先保留你的原句，检查完成前不会替你改写。</div></div>`;
    const fb=s.feedback;if(!fb)return"";
    const suggestion=norm(fb.suggestion);
    const tips=Array.isArray(fb.tips)?fb.tips.map(String).filter(Boolean):[];
    const title=String(fb.title||((fb.level==="good")?"表达可以使用":"这句话还需要调整"));
    const good=Boolean(fb.level==="good");
    const round=Number(fb.feedbackRound||0);
    return `<div class="lexi-apply-v3-feedback ${good?"good":"warn"} ai-feedback-panel ${good?"good":"warn"}">
      <div class="lexi-apply-v3-feedback-head"><div><small>${suggestion?"修改建议":"检查结果"}</small><strong>${esc(title)}</strong></div>${round?`<span style="font-size:11px;color:var(--muted)">第 ${Math.min(3,round)} / 3 轮</span>`:""}</div>
      ${suggestion?`<div class="lexi-apply-v3-suggestion">${esc(suggestion)}</div>`:""}
      ${tips.length?`<div class="lexi-apply-v3-tips">${tips.map(tip=>`<span>• ${esc(tip)}</span>`).join("")}</div>`:""}
      <div class="lexi-apply-v3-actions">
        ${suggestion?`<button class="btn primary" type="button" data-apply-stage-v3="adopt" ${s.suggestionApproved?"":"disabled"}>采用建议</button>`:""}
        ${s.approved?`<button class="btn primary" type="button" data-action="pass-apply">确认这句话 · 明天首次复习</button>`:""}
        <button class="text-action" type="button" data-apply-stage-v3="edit">继续修改</button>
      </div>
    </div>`;
  }

  function html(card){
    const s=session(card);const text=String(s.text||"");
    const prompt=String(card.practicePrompt?.question||`想一个和你自己有关的场景，用“${card.word}”表达一句你真正会说的话。`);
    const chinese=/[\u3400-\u9fff]/.test(text);
    const missing=Boolean(text.trim()&&!chinese&&!usesTarget(text,card.word));
    return `<div class="apply-learning-stage lexi-apply-stage-v3" data-apply-stage-v3-root="${esc(card.id)}">
      <div class="lexi-apply-v3-head apply-word-hero"><div class="lexi-apply-v3-word"><strong class="target-word-text">${esc(card.word)}</strong><button type="button" data-apply-stage-v3="speak-word" aria-label="播放发音">🔊</button></div><div class="lexi-apply-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div><span class="lexi-apply-v3-meaning">${esc(card.meaningZh||"")}</span></div>
      <div class="lexi-apply-v3-prompt ai-practice-prompt"><div><small>先自己表达，再让 AI 检查</small><strong>${esc(prompt)}</strong></div><button class="text-action" type="button" data-apply-stage-v3="refresh-prompt" ${s.promptLoading||s.submitting?"disabled":""}>${s.promptLoading?"正在换一个…":"换一个话题"}</button></div>
      <div class="lexi-apply-v3-composer apply-composer"><textarea class="textarea apply-composer-input" id="apply-text" placeholder="中文或英文都可以，先写你真正想表达的话…">${esc(text)}</textarea><div class="lexi-apply-v3-composer-bottom"><span>Enter 检查 · Shift + Enter 换行</span><button class="btn primary" type="button" data-action="submit-apply" data-apply-stage-v3="submit" ${s.submitting||!text.trim()?"disabled":""}>${s.submitting?"AI 正在检查…":"检查表达"}</button></div></div>
      <div id="apply-keyword-warning" class="lexi-apply-v3-warning apply-keyword-warning" ${missing?"":"hidden"}>还没有用到目标词 “${esc(card.word)}”。先自己尝试把它自然地放进句子里。</div>
      ${s.originalText?`<div class="lexi-apply-v3-undo"><button class="text-action" type="button" data-apply-stage-v3="restore">↶ 恢复我原来写的句子</button></div>`:""}
      ${feedbackHtml(card,s)}
    </div>`;
  }

  function render(){
    injectStyle();const host=document.querySelector(".study-card-focus"),card=currentCard();if(!host||!card)return;
    const s=session(card);const signature=JSON.stringify({id:card.id,text:s.text,feedback:s.feedback,submitting:s.submitting,originalText:s.originalText,approved:s.approved,suggestionApproved:s.suggestionApproved,prompt:card.practicePrompt?.question||"",promptLoading:s.promptLoading});
    if(host.dataset.applyStageV3===signature)return;
    host.dataset.applyStageV3=signature;host.innerHTML=html(card);
    if(!s.submitting)requestAnimationFrame(()=>document.getElementById("apply-text")?.focus());
  }

  async function saveCardPatch(cardId,mutate){
    const latest=await loadData();const card=latest?.cards?.find(item=>String(item.id)===String(cardId));if(!card)return null;
    mutate(card,latest);card.updatedAt=new Date().toISOString();await persist(latest);return data?.cards?.find(item=>String(item.id)===String(cardId))||card;
  }

  async function speak(text){
    const value=norm(text);if(!value)return;
    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(value))return;}catch{}
    try{const utterance=new SpeechSynthesisUtterance(value);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}
  }

  async function submit(){
    const card=currentCard();if(!card)return;const s=session(card);
    const text=norm(document.getElementById("apply-text")?.value??s.text);if(!text||s.submitting)return;
    if(copyNorm(text)&&copyNorm(text)===copyNorm(card.exampleEn||"")){
      s.text=text;s.approved=false;s.suggestionApproved=false;s.feedback={level:"warn",title:"不要直接照抄参考例句",tips:["换成一个与你自己有关的真实场景，再用这个词表达一次。"],suggestion:""};render();return;
    }
    s.text=text;s.submitting=true;s.feedback=null;s.approved=false;s.suggestionApproved=false;render();
    try{
      const response=await fetch("/api/ai/text",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word:card.word,meaningZh:card.meaningZh,sentence:text})});
      if(!response.ok)throw new Error("APPLY_AI_FAILED");
      const payload=await response.json();const fb=payload.feedback||{};const suggestion=norm(fb.suggestion);const inputLanguage=fb.inputLanguage==="zh"||/[\u3400-\u9fff]/.test(text)?"zh":"en";
      const keyword=norm(fb.keyword||card.word)||card.word;const candidate=suggestion||text;const keywordOk=usesTarget(candidate,keyword)||usesTarget(candidate,card.word);
      const candidateApproved=fb.approved!==false&&fb.level==="good"&&keywordOk&&!(inputLanguage==="zh"&&!suggestion);
      s.approved=Boolean(inputLanguage==="en"&&!suggestion&&candidateApproved);
      s.suggestionApproved=Boolean(suggestion&&candidateApproved);
      s.feedback={...fb,inputLanguage,keyword,level:candidateApproved?"good":"warn",suggestion};
    }catch(err){
      console.error("Apply Stage V3 check failed",err);
      s.feedback={level:"warn",title:"AI 暂时没有完成检查",tips:["你的句子还在，可以直接再试一次。"],suggestion:""};s.approved=false;s.suggestionApproved=false;
    }finally{s.submitting=false;render();}
  }

  function adopt(){
    const card=currentCard();if(!card)return;const s=session(card);const suggestion=norm(s.feedback?.suggestion);if(!suggestion||!s.suggestionApproved)return;
    if(s.text&&!s.originalText)s.originalText=s.text;
    s.text=suggestion;s.approved=true;s.feedback={...s.feedback,title:"已采用通过检查的修改建议",suggestion:"",tips:[]};s.suggestionApproved=false;render();
  }

  function restore(){
    const card=currentCard();if(!card)return;const s=session(card);if(!s.originalText)return;
    s.text=s.originalText;s.originalText="";s.feedback=null;s.approved=false;s.suggestionApproved=false;render();
  }

  async function refreshPrompt(){
    const card=currentCard();if(!card)return;const s=session(card);if(s.promptLoading||s.submitting)return;
    s.promptLoading=true;render();
    try{
      const previous=String(card.practicePrompt?.question||"");
      const response=await fetch("/api/ai/practice-prompt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word:card.word,meaningZh:card.meaningZh,exampleEn:card.exampleEn,previousQuestion:previous})});
      if(!response.ok)throw new Error("PROMPT_FAILED");
      const payload=await response.json();const question=norm(payload.prompt?.question);if(question)await saveCardPatch(card.id,c=>{c.practicePrompt={question};});
    }catch(err){console.error("Apply Stage V3 prompt refresh failed",err);}
    finally{s.promptLoading=false;await refresh();render();}
  }

  document.addEventListener("input",event=>{
    if(event.target?.id!=="apply-text")return;const card=currentCard();if(!card)return;const s=session(card);
    s.text=String(event.target.value||"");s.feedback=null;s.approved=false;s.suggestionApproved=false;
    const warning=document.getElementById("apply-keyword-warning");const text=s.text;const missing=Boolean(text.trim()&&!/[\u3400-\u9fff]/.test(text)&&!usesTarget(text,card.word));if(warning)warning.hidden=!missing;
    const submitButton=document.querySelector('[data-apply-stage-v3="submit"]');if(submitButton)submitButton.disabled=!text.trim()||s.submitting;
  },true);

  document.addEventListener("keydown",event=>{
    if(event.target?.id!=="apply-text"||event.key!=="Enter"||event.shiftKey||event.isComposing)return;
    event.preventDefault();void submit();
  },true);

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("[data-apply-stage-v3]");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.applyStageV3;
    const card=currentCard();const s=card?session(card):null;
    if(action==="speak-word"&&card)void speak(card.word);
    if(action==="submit")void submit();
    if(action==="adopt")adopt();
    if(action==="edit")document.getElementById("apply-text")?.focus();
    if(action==="restore")restore();
    if(action==="refresh-prompt")void refreshPrompt();
  },true);

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();render();});}
  function start(){const app=document.getElementById("app");if(!app)return;injectStyle();void refresh().then(render);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();