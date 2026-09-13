(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before visualize-actions-v3.js");

  let data=null;
  let queued=false;
  let saving=false;
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`visual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      data=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return data;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data?.cards)data=core.normalizeData(payload.data);}
    }catch{}
    return data;
  }

  async function save(next){
    const normalized=core.normalizeData(next);
    const response=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:normalized,visualizeActionsAuthority:"v3"})});
    if(!response.ok)throw new Error("SAVE_FAILED");
    data=normalized;
  }

  function currentCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function card(){
    if(!data?.cards)return null;
    const id=currentCardId();if(!id)return null;
    const current=data.cards.find(item=>String(item.id)===id)||null;
    return current&&core.canonicalStage(current)==="visualize"?current:null;
  }
  function committed(id){return Array.isArray(data?.activities)&&data.activities.some(item=>String(item.commandId||"")===id);}
  function stageBusy(){return Boolean(window.LexiFlowVisualizeStageV3?.isBusy?.()||saving);}

  function decorate(){
    const note=document.getElementById("visual-note"),footer=document.querySelector(".learning-stage-footer");
    if(!note||!footer)return;
    const current=card();if(!current)return;
    const hasImage=Boolean(current.imageData||current.imageUrl),busy=stageBusy();
    const next=footer.querySelector('[data-action="finish-visual"]');
    let skip=footer.querySelector('[data-visual-actions-v3="skip"]');
    if(hasImage){
      skip?.remove();
      if(next){
        next.disabled=busy;
        next.textContent=busy?"正在保存当前联想…":"完成视觉联想 · 明天开始造句";
        next.title=busy?"当前联想正在保存，完成后再进入下一阶段。":"";
      }
      return;
    }
    if(next){
      next.disabled=true;
      next.textContent=busy?"正在保存当前联想…":"先生成/上传图片，或选择跳过";
      next.title=busy?"当前联想正在保存，完成后才能继续。":"没有图片时请明确选择是否跳过视觉联想";
    }
    const idleLabel=String(note.value||"").trim()?"不生成图片，继续":"暂时跳过视觉联想";
    const label=busy?"正在保存当前联想…":idleLabel;
    if(skip){skip.disabled=busy;skip.textContent=label;skip.title=busy?"当前联想正在保存，完成后才能跳过。":"";return;}
    skip=document.createElement("button");
    skip.type="button";
    skip.className="btn";
    skip.dataset.visualActionsV3="skip";
    skip.disabled=busy;
    skip.textContent=label;
    skip.title=busy?"当前联想正在保存，完成后才能跳过。":"";
    footer.prepend(skip);
  }

  async function skip(){
    if(stageBusy())return;
    const id=currentCardId();if(!id)return;
    const now=new Date();
    const transition=window.LexiFlowStageTransitionV3;
    const write=transition?.beginStageWrite?.(id,"visualize",now);
    if(!write)return;
    const cmd=write.commandId;
    saving=true;decorate();
    try{
      await refresh(true);
      if(committed(cmd)){location.reload();return;}
      const current=card();if(!current){location.reload();return;}
      const note=String(document.getElementById("visual-note")?.value||"").trim(),prev={...current,learningStage:"visualize"};
      current.visualNote=note;
      current.visualSkipped=true;
      current.stage="apply";
      current.learningStage="apply";
      Object.assign(current,core.crossDayPatch(prev,{stage:"apply",learningStage:"apply"},now)||{});
      current.updatedAt=now.toISOString();
      data.activities=Array.isArray(data.activities)?data.activities:[];
      data.activities.push({id:uid(),type:"stage-complete",cardId:current.id,stage:"visualize",skipped:true,nextStage:"apply",commandId:cmd,at:now.toISOString(),authority:"visualize-actions-v3"});
      await save(data);
      location.reload();
    }catch(err){console.error("Visualize skip failed",err);}
    finally{transition?.endStageWrite?.(write);saving=false;decorate();}
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-visual-actions-v3="skip"]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void skip();
  },true);

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;syncFromGateway();decorate();});}
  function start(){
    const app=document.getElementById("app");if(!app)return;
    syncFromGateway();
    if(data)decorate();else void refresh(true).then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();