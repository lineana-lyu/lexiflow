(() => {
  "use strict";

  const drafts=new Map();

  function activeCardId(input){
    return String(input?.closest?.("[data-apply-stage-v3-root]")?.dataset?.applyStageV3Root||"");
  }
  function setDraft(cardId,value,selectionStart=null,selectionEnd=null){
    const key=String(cardId||"");if(!key)return;
    const text=String(value||"");
    const start=Number.isInteger(selectionStart)?selectionStart:text.length;
    const end=Number.isInteger(selectionEnd)?selectionEnd:start;
    drafts.set(key,{value:text,selectionStart:start,selectionEnd:end});
  }
  function clearDraft(cardId){const key=String(cardId||"");if(key)drafts.delete(key);}

  function remember(input){
    const cardId=activeCardId(input);if(!cardId)return;
    setDraft(cardId,input.value,input.selectionStart,input.selectionEnd);
    window.LexiFlowApplyStageV3?.handleInput?.(input);
  }

  window.addEventListener("input",event=>{
    const input=event.target;
    if(input?.id!=="apply-text")return;
    remember(input);
    // Apply V3 owns this editor. Stop legacy app.js from remounting the composer
    // after every keystroke, which otherwise resets the caret to the start.
    event.stopImmediatePropagation();
  },true);

  function restore(){
    const input=document.getElementById("apply-text");if(!input)return;
    const cardId=activeCardId(input);if(!cardId)return;
    const draft=drafts.get(cardId);if(!draft)return;
    if(input.value!==draft.value)input.value=draft.value;
    window.LexiFlowApplyStageV3?.handleInput?.(input);
    if(document.activeElement!==input)return;
    const length=input.value.length;
    const start=Math.max(0,Math.min(length,Number(draft.selectionStart)||0));
    const end=Math.max(start,Math.min(length,Number(draft.selectionEnd)||start));
    try{input.setSelectionRange(start,end);}catch{}
  }

  function start(){
    const app=document.getElementById("app");if(!app)return;
    new MutationObserver(()=>queueMicrotask(restore)).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowApplyInputGuardV3=Object.freeze({setDraft,clearDraft});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
