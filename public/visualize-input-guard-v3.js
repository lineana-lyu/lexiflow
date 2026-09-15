(() => {
  "use strict";

  const drafts=new Map();

  function activeCardId(input){
    return String(input?.closest?.("[data-visualize-stage-v3]")?.dataset?.visualizeStageV3||"");
  }

  function updateActions(input){
    const empty=!String(input?.value||"").trim();
    const root=input?.closest?.("[data-visualize-stage-v3]")||document;
    const assist=root.querySelector?.('[data-visual-v3="assist"]');
    const generate=root.querySelector?.('[data-visual-v3="generate"]');
    if(assist&&!assist.dataset.visualGuardBusy)assist.disabled=empty;
    if(generate&&!generate.dataset.visualGuardBusy)generate.disabled=empty;
  }

  function remember(input){
    const cardId=activeCardId(input);
    if(!cardId)return;
    drafts.set(cardId,String(input.value||""));
    updateActions(input);
  }

  window.addEventListener("input",event=>{
    const input=event.target;
    if(input?.id!=="visual-note")return;
    remember(input);
    // Visualize V3 owns this editor. Prevent legacy/global input handlers from
    // remounting the study surface after every keystroke.
    event.stopImmediatePropagation();
  },true);

  function restore(){
    const input=document.getElementById("visual-note");
    if(!input)return;
    const cardId=activeCardId(input);
    if(!cardId||!drafts.has(cardId))return;
    const value=drafts.get(cardId);
    if(input.value===value)return;
    input.value=value;
    updateActions(input);
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    new MutationObserver(()=>queueMicrotask(restore)).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
