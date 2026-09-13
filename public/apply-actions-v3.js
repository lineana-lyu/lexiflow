(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before apply-actions-v3.js");

  let data=null;
  let queued=false;
  let saving=false;
  let restoring=false;
  let skipArmedUntil=0;

  const uid=()=>crypto.randomUUID?crypto.randomUUID():`apply-action-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      data=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function loadData(force=false){
    if(!force&&syncFromGateway())return data;
    const response=await fetch("/api/learning-data",{cache:"no-store"});
    if(!response.ok)throw new Error("LOAD_FAILED");
    const payload=await response.json();
    data=payload?.data?core.normalizeData(payload.data):null;
    return data;
  }

  async function persist(next){
    const normalized=core.normalizeData(next);
    const response=await fetch("/api/learning-data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data:normalized,applyActionsAuthority:"v3"}),
    });
    if(!response.ok)throw new Error("SAVE_FAILED");
    data=normalized;
  }

  function currentCardId(){
    return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
  }

  function currentApplyCard(source=data){
    const id=currentCardId();
    if(!id||!Array.isArray(source?.cards))return null;
    const card=source.cards.find(item=>String(item.id)===id)||null;
    return card&&core.canonicalStage(card)==="apply"?card:null;
  }

  function currentDraft(card){
    return String(document.getElementById("apply-text")?.value??card?.applyDraft??card?.userSentence??"").trim();
  }

  function appendActivity(source,cardId,type,extra={}){
    source.activities=Array.isArray(source.activities)?source.activities:[];
    if(extra.commandId&&source.activities.some(item=>String(item.commandId||"")===extra.commandId))return;
    source.activities.push({id:uid(),type,cardId,at:new Date().toISOString(),authority:"apply-actions-v3",...extra});
  }

  function commandCommitted(source,commandId){
    return Array.isArray(source?.activities)&&source.activities.some(item=>String(item.commandId||"")===commandId);
  }

  function beginApplyWrite(now=new Date()){
    const id=currentCardId();if(!id)return null;
    const transition=window.LexiFlowStageTransitionV3;
    const write=transition?.beginStageWrite?.(id,"apply",now);
    return write?{id,transition,write}:null;
  }
  function stageBusy(){return Boolean(window.LexiFlowApplyStageV3?.isBusy?.()||saving);}

  function pauseAndReturn(){
    window.LexiFlowStudySessionV3?.pause?.();
    setTimeout(()=>location.reload(),100);
  }

  function restoreDurableDraft(){
    const input=document.getElementById("apply-text");
    if(!input||String(input.value||"").trim()||restoring)return;
    syncFromGateway();
    const card=currentApplyCard();
    const draft=String(card?.applyDraft||"");
    if(!draft)return;
    restoring=true;
    try{
      input.value=draft;
      input.dispatchEvent(new Event("input",{bubbles:true}));
    }finally{restoring=false;}
  }

  function temporaryBusyCopy(button,idle){
    if(!button)return;
    button.disabled=true;
    button.textContent="当前阶段正在保存…";
    setTimeout(()=>{if(button.isConnected&&!stageBusy()){button.disabled=false;button.textContent=idle;}},700);
  }

  async function saveDraft(button){
    if(stageBusy()){temporaryBusyCopy(button,"保存草稿并退出");return;}
    const guard=beginApplyWrite();
    if(!guard){temporaryBusyCopy(button,"保存草稿并退出");return;}
    saving=true;decorate();
    const original=button.textContent;
    button.disabled=true;
    button.textContent="正在保存…";
    try{
      const source=await loadData(true);
      const card=currentApplyCard(source);
      if(!card)throw new Error("APPLY_CARD_NOT_FOUND");
      const draft=currentDraft(card);
      card.applyDraft=draft;
      card.applyDraftSavedAt=new Date().toISOString();
      card.updatedAt=card.applyDraftSavedAt;
      appendActivity(source,card.id,"apply-draft-saved",{hasText:Boolean(draft)});
      await persist(source);
      button.textContent="草稿已保存";
      pauseAndReturn();
    }catch(err){
      console.error("Apply draft save failed",err);
      button.disabled=false;
      button.textContent=original;
      window.alert("草稿没有保存成功，请保持 LexiFlow 本地服务运行后重试。");
    }finally{
      guard.transition?.endStageWrite?.(guard.write);
      saving=false;decorate();
    }
  }

  async function skipApply(button){
    if(stageBusy()){temporaryBusyCopy(button,"跳过本次造句");return;}
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
    const now=new Date(),guard=beginApplyWrite(now);
    if(!guard){temporaryBusyCopy(button,"跳过本次造句");return;}
    saving=true;
    skipArmedUntil=0;
    button.disabled=true;
    button.textContent="正在跳过…";
    const commandId=guard.write.commandId;
    try{
      const source=await loadData(true);
      if(commandCommitted(source,commandId)){location.reload();return;}
      const card=currentApplyCard(source);
      if(!card)throw new Error("APPLY_CARD_NOT_FOUND");
      const prev={...card},draft=currentDraft(card);
      card.applyDraft=draft;
      card.applySkipped=true;
      card.applySkippedOn=core.dayKey(now);
      card.stage="review";
      card.learningStage="review";
      card.initialReviewPending=false;
      Object.assign(card,core.crossDayPatch(prev,{stage:"review",learningStage:"review"},now)||{});
      card.updatedAt=now.toISOString();
      appendActivity(source,card.id,"stage-complete",{stage:"apply",skipped:true,hasDraft:Boolean(draft),nextStage:"review",commandId});
      await persist(source);
      button.textContent="已跳过 · 明天首次复习";
      setTimeout(()=>location.reload(),100);
    }catch(err){
      console.error("Apply skip failed",err);
      button.disabled=false;
      button.textContent="跳过本次造句";
      button.classList.remove("danger");
      window.alert("跳过状态没有保存成功，本次造句仍未完成，请重试。");
    }finally{
      guard.transition?.endStageWrite?.(guard.write);
      saving=false;decorate();
    }
  }

  function decorate(){
    const stage=document.querySelector(".apply-learning-stage");
    if(!stage)return;
    restoreDurableDraft();
    let bar=stage.querySelector("[data-apply-actions-v3]");
    if(!bar){
      bar=document.createElement("div");
      bar.dataset.applyActionsV3="1";
      bar.className="learning-stage-footer lexi-apply-actions-v3";
      bar.style.cssText="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px";
      bar.innerHTML='<button class="btn" type="button" data-apply-v3="draft">保存草稿并退出</button><button class="text-action" type="button" data-apply-v3="skip">跳过本次造句</button>';
      stage.appendChild(bar);
    }
    const busy=stageBusy(),draft=bar.querySelector('[data-apply-v3="draft"]'),skip=bar.querySelector('[data-apply-v3="skip"]');
    if(draft&&!saving){draft.disabled=busy;draft.textContent=busy?"当前阶段正在保存…":"保存草稿并退出";}
    if(skip&&!saving&&skipArmedUntil<Date.now()){skip.disabled=busy;skip.textContent=busy?"当前阶段正在保存…":"跳过本次造句";skip.classList.remove("danger");}
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
    requestAnimationFrame(()=>{queued=false;syncFromGateway();decorate();});
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    syncFromGateway();
    if(data)decorate();else void loadData(true).then(decorate).catch(()=>{});
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();