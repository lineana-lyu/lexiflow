(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before study-stage-surface-v3.js");

  const STAGES=[
    ["select","选词确认"],
    ["memorize","记忆"],
    ["visualize","视觉联想"],
    ["apply","造句应用"],
    ["review","复习巩固"],
  ];
  const LABELS=Object.freeze({select:"待确认",memorize:"记忆中",visualize:"视觉联想",apply:"造句应用",review:"复习巩固"});
  let data=null;
  let queued=false;
  let refreshing=false;

  async function refresh(){
    if(refreshing)return data;refreshing=true;
    try{const response=await fetch("/api/learning-data",{cache:"no-store"});if(response.ok){const payload=await response.json();if(payload?.data)data=core.normalizeData(payload.data);}}catch{}
    finally{refreshing=false;}
    return data;
  }
  function cardById(id){return data?.cards?.find(card=>String(card.id)===String(id))||null;}

  function decorateStepper(){
    const stepper=document.querySelector(".study-stepper");if(!stepper)return;
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");const card=cardById(id);if(!card)return;
    const stage=core.canonicalStage(card);const index=STAGES.findIndex(([key])=>key===stage);if(index<0)return;
    const signature=`${card.id}:${stage}`;if(stepper.dataset.stageSurfaceV3===signature)return;
    stepper.dataset.stageSurfaceV3=signature;
    stepper.innerHTML=STAGES.map(([key,label],i)=>`<div class="study-stepper-item ${i<index?"done":i===index?"active":""}"><span class="study-stepper-dot">${i<index?"✓":i+1}</span><span>${label}</span></div>${i<STAGES.length-1?`<i class="study-stepper-line ${i<index?"done":""}"></i>`:""}`).join("");
  }

  function decorateLibrary(){
    document.querySelectorAll("[data-library-card]").forEach(row=>{
      const card=cardById(row.dataset.libraryCard);if(!card)return;
      const stage=core.canonicalStage(card);const cells=row.querySelectorAll("td");if(cells.length<5)return;
      const label=card.memoryState==="stable"?"长期稳定":LABELS[stage]||stage;
      if(cells[4].textContent.trim()!==label)cells[4].textContent=label;
    });
  }

  function decorate(){decorateStepper();decorateLibrary();}
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();