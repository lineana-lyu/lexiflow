(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before apply-actions-v3.js");

  let queued=false;
  let saving=false;
  let skipArmedUntil=0;

  const uid=()=>crypto.randomUUID?crypto.randomUUID():`apply-action-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function loadData(){
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    return payload?.data||null;
  }

  async function persist(data){
    const response=await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:core.normalizeData(data)}),
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
  }

  function currentCardId(){
    return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
  }

  function currentApplyCard(data){
    const id=currentCardId();
    if(!id||!Array.isArray(data?.cards))return null;
    return data.cards.find(card=>String(card.id)===id&&card.stage==="apply")||null;
  }

  function currentDraft(card){
    return String(document.getElementById("apply-text")?.value??card?.applyDraft??card?.userSentence??"").trim();
  }

  function appendActivity(data,cardId,type,extra={}){
    data.activities=Array.isArray(data.activities)?data.activities:[];
    data.activities.push({id:uid(),type,cardId,at:new Date().toISOString(),...extra});
  }

  function pauseAndReturn(){
    window.LexiFlowStudySessionV3?.pause?.();
    setTimeout(()=>location.reload(),100);
  }

  async function saveDraft(button){
    if(saving)return;
    saving=true;
    const original=button.textContent;
    button.disabled=true;
    button.textContent="正在保存…";
    try{
      const data=await loadData();
      const card=currentApplyCard(data);
      if(!card)throw new Error("APPLY_CARD_NOT_FOUND");
      const draft=currentDraft(card);
      card.applyDraft=draft;
      card.applyDraftSavedAt=new Date().toISOString();
      card.updatedAt=card.applyDraftSavedAt;
      appendActivity(data,card.id,"apply-draft-saved",{hasText:Boolean(draft)});
      await persist(data);
      button.textContent="草稿已保存";
      pauseAndReturn();
    }catch(err){
      console.error("Apply draft save failed",err);
      button.disabled=false;
      button.textContent=original;
      window.alert("草稿没有保存成功，请保持 LexiFlow 本地服务运行后重试。");
    }finally{
      saving=false;
    }
  }

  async function skipApply(button){
    const nowMs=Date.now();
    if(skipArmedUntil<nowMs){
      skipArmedUntil=nowMs+5000;
      button.textContent="再次点击确认跳过";
      button.classList.add("danger");
      setTimeout(()=>{
        if(Date.now()>=skipArmedUntil){
          skipArmedUntil=0;
          if(button.isConnected){button.textContent="跳过本次造句";button.classList.remove("danger");}
        }
      },5100);
      return;
    }
    if(saving)return;
    saving=true;
    skipArmedUntil=0;
    button.disabled=true;
    button.textContent="正在跳过…";
    try{
      const data=await loadData();
      const card=currentApplyCard(data);
      if(!card)throw new Error("APPLY_CARD_NOT_FOUND");
      const now=new Date(),prev={...card},draft=currentDraft(card);
      card.applyDraft=draft;
      card.applySkipped=true;
      card.applySkippedOn=core.dayKey(now);
      card.stage="review";
      card.initialReviewPending=false;
      Object.assign(card,core.crossDayPatch(prev,{stage:"review"},now)||{});
      card.updatedAt=now.toISOString();
      appendActivity(data,card.id,"stage-complete",{stage:"apply",skipped:true,hasDraft:Boolean(draft)});
      await persist(data);
      button.textContent="已跳过 · 明天首次复习";
      setTimeout(()=>location.reload(),100);
    }catch(err){
      console.error("Apply skip failed",err);
      button.disabled=false;
      button.textContent="跳过本次造句";
      button.classList.remove("danger");
      window.alert("跳过状态没有保存成功，本次造句仍未完成，请重试。");
    }finally{
      saving=false;
    }
  }

  function decorate(){
    const stage=document.querySelector(".apply-learning-stage");
    if(!stage)return;
    if(stage.querySelector("[data-apply-actions-v3]"))return;
    const bar=document.createElement("div");
    bar.dataset.applyActionsV3="1";
    bar.className="learning-stage-footer lexi-apply-actions-v3";
    bar.style.cssText="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px";
    bar.innerHTML='<button class="btn" type="button" data-apply-v3="draft">保存草稿并退出</button><button class="text-action" type="button" data-apply-v3="skip">跳过本次造句</button>';
    stage.appendChild(bar);
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("[data-apply-v3]");
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.dataset.applyV3==="draft")void saveDraft(button);
    if(button.dataset.applyV3==="skip")void skipApply(button);
  },true);

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate();});
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    decorate();
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
