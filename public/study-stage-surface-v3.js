(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before study-stage-surface-v3.js");

  const STAGES=Object.freeze([
    ["select","选词确认"],
    ["memorize","记忆"],
    ["visualize","视觉联想"],
    ["apply","造句应用"],
    ["review","复习巩固"],
  ]);
  const LABELS=Object.freeze({select:"待确认",memorize:"记忆中",visualize:"视觉联想",apply:"造句应用",review:"复习巩固"});
  const ROOTS=Object.freeze({
    select:'[data-select-stage-v3]',
    memorize:'.lexi-m2',
    visualize:'[data-visualize-stage-v3]',
    apply:'[data-apply-stage-v3-root]',
  });

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

  function cardById(id){return data?.cards?.find(card=>String(card.id)===String(id))||null;}
  function currentCard(){
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    return id?cardById(id):null;
  }

  function injectStyle(){
    if(document.getElementById("lexi-stage-surface-v3-style"))return;
    const style=document.createElement("style");
    style.id="lexi-stage-surface-v3-style";
    style.textContent=`
      .study-card-focus:not([data-stage-host-v3]){visibility:hidden}
      .study-card-focus[data-stage-host-v3]{visibility:visible}
      .study-card-focus [data-study-stage-host-v3]{min-height:460px;display:grid;place-items:center;text-align:center;color:var(--muted);font-size:13px}
      .study-card-focus [data-study-stage-host-v3] strong{display:block;color:var(--text);font-size:16px;margin-bottom:6px}
    `;
    document.head.appendChild(style);
  }

  function decorateStepper(){
    const stepper=document.querySelector(".study-stepper");
    const card=currentCard();
    if(!stepper||!card)return;
    const stage=core.canonicalStage(card);
    const index=STAGES.findIndex(([key])=>key===stage);
    if(index<0)return;
    const signature=`${card.id}:${stage}`;
    if(stepper.dataset.stageSurfaceV3===signature)return;
    stepper.dataset.stageSurfaceV3=signature;
    stepper.innerHTML=STAGES.map(([key,label],i)=>`<div class="study-stepper-item ${i<index?"done":i===index?"active":""}"><span class="study-stepper-dot">${i<index?"✓":i+1}</span><span>${label}</span></div>${i<STAGES.length-1?`<i class="study-stepper-line ${i<index?"done":""}"></i>`:""}`).join("");
  }

  function decorateStageHost(){
    const host=document.querySelector(".study-card-focus");
    const card=currentCard();
    if(!host||!card)return;
    const stage=core.canonicalStage(card);
    const root=ROOTS[stage];
    if(!root)return;
    const signature=`${card.id}:${stage}`;
    host.dataset.stageHostV3=signature;
    if(host.querySelector(root))return;
    if(host.querySelector('[data-study-stage-host-v3]'))return;
    host.innerHTML=`<div data-study-stage-host-v3="${stage}"><div><strong>正在准备 ${LABELS[stage]||stage}</strong><span>学习内容由当前阶段模块加载，不会回退到旧学习流程。</span></div></div>`;
  }

  function decorateLibrary(){
    document.querySelectorAll("[data-library-card]").forEach(row=>{
      const card=cardById(row.dataset.libraryCard);if(!card)return;
      const stage=core.canonicalStage(card);const cells=row.querySelectorAll("td");if(cells.length<5)return;
      const label=card.memoryState==="stable"?"长期稳定":LABELS[stage]||stage;
      if(cells[4].textContent.trim()!==label)cells[4].textContent=label;
    });
  }

  function decorateLegacyBadges(){
    document.querySelectorAll(".pill").forEach(node=>{
      const text=String(node.textContent||"").trim();
      if(text==="英→中"||text==="中→英"||text==="memorize")node.textContent="记忆中";
      else if(text==="选词确认")node.textContent="待确认";
      else if(text==="造句")node.textContent="造句应用";
      else if(text==="已掌握")node.textContent="长期稳定";
    });
  }

  function decorate(){
    injectStyle();
    decorateStepper();
    decorateStageHost();
    decorateLibrary();
    decorateLegacyBadges();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      decorateLegacyBadges();
      await refresh();
      decorate();
    });
  }

  function start(){
    injectStyle();
    const app=document.getElementById("app");
    if(!app)return;
    decorateLegacyBadges();
    void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowStudyStageSurfaceV3=Object.freeze({stages:STAGES.map(([stage])=>stage)});

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();