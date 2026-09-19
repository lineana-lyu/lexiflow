(() => {
  "use strict";

  const drafts=new Map();

  function activeCardId(input){
    return String(input?.closest?.("[data-apply-stage-v3-root]")?.dataset?.applyStageV3Root||"");
  }
  function setDraft(cardId,value){
    const key=String(cardId||"");if(!key)return;
    drafts.set(key,{value:String(value||"")});
  }
  function clearDraft(cardId){const key=String(cardId||"");if(key)drafts.delete(key);}

  function remember(input){
    const cardId=activeCardId(input);if(!cardId)return;
    setDraft(cardId,input.value);
    window.LexiFlowApplyStageV3?.handleInput?.(input);
  }

  window.addEventListener("input",event=>{
    const input=event.target;
    if(input?.id!=="apply-text")return;
    remember(input);
    // Apply V3 owns this editor. Stop legacy app.js from remounting it per keystroke.
    // Do not own selection/caret: native textarea behavior must remain untouched.
    event.stopImmediatePropagation();
  },true);

  function restore(){
    const input=document.getElementById("apply-text");if(!input)return;
    const cardId=activeCardId(input);if(!cardId)return;
    const draft=drafts.get(cardId);if(!draft)return;
    // Remount recovery restores text only. The browser owns selection/caret.
    if(input.value!==draft.value)input.value=draft.value;
  }

  function start(){
    const app=document.getElementById("app");if(!app)return;
    new MutationObserver(()=>queueMicrotask(restore)).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowApplyInputGuardV3=Object.freeze({setDraft,clearDraft});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
