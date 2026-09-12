(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before visualize-actions-v3.js");

  let data=null;
  let queued=false;
  let saving=false;
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`visual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function refresh(){
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data?.cards)data=core.normalizeData(payload.data);}
    }catch{}
    return data;
  }

  async function save(next){
    const response=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:core.normalizeData(next)})});
    if(!response.ok)throw new Error("SAVE_FAILED");
  }

  function currentCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function card(){
    if(!data?.cards)return null;
    const id=currentCardId();if(!id)return null;
    const current=data.cards.find(item=>String(item.id)===id)||null;
    return current&&core.canonicalStage(current)==="visualize"?current:null;
  }
  function commandId(cardId,now=new Date()){return `stage:${core.dayKey(now)}:${String(cardId)}:visualize-skip`;}
  function committed(id){return Array.isArray(data?.activities)&&data.activities.some(item=>String(item.commandId||"")===id);}

  function decorate(){
    const note=document.getElementById("visual-note"),footer=document.querySelector(".learning-stage-footer");
    if(!note||!footer)return;
    const current=card();if(!current)return;
    const hasImage=Boolean(current.imageData||current.imageUrl);
    const next=footer.querySelector('[data-action="finish-visual"]');
    footer.querySelector('[data-visual-actions-v3="skip"]')?.remove();
    if(hasImage){
      if(next){next.disabled=false;next.textContent="完成视觉联想 · 明天开始造句";next.title="";}
      return;
    }
    if(next){next.disabled=true;next.textContent="先生成/上传图片，或选择跳过";next.title="没有图片时请明确选择是否跳过视觉联想";}
    const skip=document.createElement("button");
    skip.type="button";
    skip.className="btn";
    skip.dataset.visualActionsV3="skip";
    skip.textContent=String(note.value||"").trim()?"不生成图片，继续":"暂时跳过视觉联想";
    footer.prepend(skip);
  }

  async function skip(){
    if(saving)return;
    saving=true;
    try{
      await refresh();
      const id=currentCardId();if(!id)return;
      const now=new Date(),cmd=commandId(id,now);
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
      data.activities.push({id:uid(),type:"stage-complete",cardId:current.id,stage:"visualize",skipped:true,nextStage:"apply",commandId:cmd,at:now.toISOString()});
      await save(data);
      location.reload();
    }catch(err){console.error("Visualize skip failed",err);}
    finally{saving=false;}
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-visual-actions-v3="skip"]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void skip();
  },true);

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
