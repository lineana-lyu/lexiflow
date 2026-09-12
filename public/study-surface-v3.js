(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before study-surface-v3.js");

  const STAGES=Object.freeze([
    ["select","Select"],
    ["memorize","Memorize"],
    ["visualize","Visualize"],
    ["apply","Apply"],
    ["review","Review"],
  ]);

  let data=null;
  let queued=false;
  let refreshing=false;

  async function refresh(){
    if(refreshing)return data;
    refreshing=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data)data=core.normalizeData(payload.data);
      }
    }catch{}
    finally{refreshing=false;}
    return data;
  }

  function currentCard(){
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id||!Array.isArray(data?.cards))return null;
    return data.cards.find(card=>String(card.id)===id)||null;
  }

  function injectStyle(){
    if(document.getElementById("lexi-study-surface-v3-style"))return;
    const style=document.createElement("style");
    style.id="lexi-study-surface-v3-style";
    style.textContent=`
      .study-progress-wrap:not([data-study-surface-v3]){visibility:hidden}
      .study-progress-wrap[data-study-surface-v3]{visibility:visible}
      .study-stepper[data-study-surface-v3-rail]{grid-template-columns:repeat(9,minmax(0,auto))}
      @media(max-width:900px){.study-stepper[data-study-surface-v3-rail]{overflow-x:auto;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function rail(card){
    const current=core.canonicalStage(card);
    const index=STAGES.findIndex(([stage])=>stage===current);
    return `<div class="study-stepper" data-study-surface-v3-rail="1">${STAGES.map(([stage,label],i)=>{
      const state=i<index?"done":i===index?"active":"";
      const marker=i<index?"✓":i+1;
      return `<div class="study-stepper-item ${state}"><span class="study-stepper-dot">${marker}</span><span>${label}</span></div>${i<STAGES.length-1?`<i class="study-stepper-line ${i<index?"done":""}"></i>`:""}`;
    }).join("")}</div>`;
  }

  function canonicalizeLegacyLabels(){
    document.querySelectorAll(".pill").forEach(node=>{
      const value=String(node.textContent||"").trim();
      if(value==="英→中"||value==="中→英")node.textContent="记忆";
      if(value==="选词确认")node.textContent="确认词义";
      if(value==="造句")node.textContent="造句应用";
      if(value==="已掌握")node.textContent="长期稳定";
    });
  }

  function decorate(){
    injectStyle();
    canonicalizeLegacyLabels();
    const wrap=document.querySelector(".study-progress-wrap");
    if(!wrap)return;
    const card=currentCard();
    if(!card)return;
    const signature=`${card.id}:${core.canonicalStage(card)}`;
    if(wrap.dataset.studySurfaceV3===signature)return;
    wrap.dataset.studySurfaceV3=signature;
    wrap.innerHTML=rail(card);
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      await refresh();
      decorate();
    });
  }

  function start(){
    injectStyle();
    const app=document.getElementById("app");
    if(!app)return;
    void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowStudySurfaceV3=Object.freeze({stages:STAGES.map(([stage])=>stage)});

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
