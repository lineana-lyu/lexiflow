(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before select-stage-v3.js");

  let data=null;
  let queued=false;
  let refreshing=false;
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const phonetic=value=>{const s=String(value||"").trim();return !s?"暂无音标":((s.startsWith("/")&&s.endsWith("/"))||(s.startsWith("[")&&s.endsWith("]")))?s:`/${s}/`;};

  async function refresh(){
    if(refreshing)return data;
    refreshing=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data)data=core.normalizeData(payload.data);}
    }catch{}
    refreshing=false;
    return data;
  }

  function currentCard(){
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id||!Array.isArray(data?.cards))return null;
    const card=data.cards.find(item=>String(item.id)===id)||null;
    return card&&core.canonicalStage(card)==="select"&&!card.inboxPending?card:null;
  }

  function injectStyle(){
    if(document.getElementById("lexi-select-v3-style"))return;
    const style=document.createElement("style");style.id="lexi-select-v3-style";
    style.textContent=`.lexi-select-v3{min-height:500px;padding:4px;display:flex;flex-direction:column}.lexi-select-v3-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.lexi-select-v3-head span{font-size:12px;color:var(--muted)}.lexi-select-v3-body{width:min(640px,100%);margin:34px auto 0;display:grid;gap:18px}.lexi-select-v3-word{display:flex;align-items:center;justify-content:center;gap:9px;text-align:center}.lexi-select-v3-word strong{font-size:40px;line-height:1.1}.lexi-select-v3-word button{border:0;background:transparent;cursor:pointer;font-size:18px}.lexi-select-v3-meta{text-align:center;color:var(--muted);font-size:13px}.lexi-select-v3-answer{padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--surface);display:grid;gap:11px}.lexi-select-v3-answer>strong{font-size:21px}.lexi-select-v3-example{padding-top:11px;border-top:1px solid var(--line);line-height:1.65}.lexi-select-v3-example p{margin:4px 0 0;color:var(--muted)}.lexi-select-v3-actions{display:flex;justify-content:flex-end}.lexi-select-v3-actions .btn{min-width:210px}@media(max-width:700px){.lexi-select-v3-word strong{font-size:34px}.lexi-select-v3-actions .btn{width:100%}}`;
    document.head.appendChild(style);
  }

  function html(card){
    return `<div class="lexi-select-v3" data-select-stage-v3="${esc(card.id)}"><div class="lexi-select-v3-head"><strong>Select · 确认词义</strong><span>确认的是你真正想学、想说的这个意思</span></div><div class="lexi-select-v3-body"><div><div class="lexi-select-v3-word"><strong>${esc(card.word)}</strong><button type="button" data-select-v3="speak" aria-label="播放发音">🔊</button></div><div class="lexi-select-v3-meta">${esc(phonetic(card.phonetic))}${card.pos?` · ${esc(card.pos)}`:""}</div></div><div class="lexi-select-v3-answer"><strong>${esc(card.meaningZh||"")}</strong>${card.exampleEn?`<div class="lexi-select-v3-example"><div>${esc(card.exampleEn)}</div>${card.exampleZh?`<p>${esc(card.exampleZh)}</p>`:""}</div>`:""}</div><div class="lexi-select-v3-actions"><button class="btn primary" type="button" data-action="complete-stage" data-next="memorize">确认这个词义 · 明天开始记忆</button></div></div></div>`;
  }

  function decorate(){
    injectStyle();
    const host=document.querySelector(".study-card-focus");if(!host)return;
    const card=currentCard();if(!card)return;
    if(host.querySelector(`[data-select-stage-v3="${CSS.escape(String(card.id))}"]`))return;
    host.innerHTML=html(card);
  }

  async function speak(){
    const card=currentCard();if(!card)return;
    try{if(typeof window.LexiFlowNaturalTts?.play==="function"&&await window.LexiFlowNaturalTts.play(card.word))return;}catch{}
    try{const utterance=new SpeechSynthesisUtterance(card.word);utterance.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(utterance);}catch{}
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-select-v3="speak"]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();void speak();
  },true);

  function schedule(){
    if(queued)return;queued=true;
    requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});
  }

  function start(){
    const app=document.getElementById("app");if(!app)return;
    injectStyle();void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();