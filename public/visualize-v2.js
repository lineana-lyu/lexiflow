(() => {
  "use strict";
  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before visualize-v2.js");
  let data=null,queued=false,saving=false;
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`visual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function refresh(){try{const r=await fetch("/api/learning-data",{cache:"no-store"});if(r.ok){const p=await r.json();if(p?.data?.cards)data=p.data;}}catch{}return data;}
  async function save(next){const r=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:next})});if(!r.ok)throw new Error("SAVE_FAILED");}
  function currentCardId(){return String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");}
  function card(){
    if(!data?.cards)return null;
    const id=currentCardId();
    if(!id)return null;
    const current=data.cards.find(item=>String(item.id)===id)||null;
    return current?.stage==="visualize"?current:null;
  }
  function commandId(cardId,now=new Date()){return `stage:${core.dayKey(now)}:${String(cardId)}:visualize-skip`;}
  function committed(id){return Array.isArray(data?.activities)&&data.activities.some(item=>String(item.commandId||"")===id);}

  function decorate(){
    const note=document.getElementById("visual-note"),footer=document.querySelector(".learning-stage-footer");if(!note||!footer)return;
    const c=card();if(!c)return;
    const hasImage=Boolean(c.imageData||c.imageUrl);
    const next=footer.querySelector('[data-action="finish-visual"]');
    footer.querySelector('[data-v2="skip-visual"]')?.remove();
    if(hasImage){if(next){next.disabled=false;next.textContent="下一步";next.title="";}return;}
    if(next){next.disabled=true;next.textContent="先生成/上传图片，或选择跳过";next.title="没有图片时请明确选择是否跳过视觉联想";}
    const skip=document.createElement("button");skip.type="button";skip.className="btn";skip.dataset.v2="skip-visual";skip.textContent=String(note.value||"").trim()?"不生成图片，继续":"暂时跳过视觉联想";footer.prepend(skip);
  }

  async function skip(){
    if(saving)return;saving=true;
    try{
      await refresh();
      const id=currentCardId();
      if(!id)return;
      const now=new Date(),cmd=commandId(id,now);
      if(committed(cmd)){location.reload();return;}
      const c=card();if(!c){location.reload();return;}
      const note=String(document.getElementById("visual-note")?.value||"").trim(),prev={...c};
      c.visualNote=note;c.visualSkipped=true;c.stage="apply";Object.assign(c,core.crossDayPatch(prev,{stage:"apply"},now)||{});c.updatedAt=now.toISOString();
      data.activities=Array.isArray(data.activities)?data.activities:[];
      data.activities.push({id:uid(),type:"stage-complete",cardId:c.id,stage:"visualize",skipped:true,commandId:cmd,at:now.toISOString()});
      await save(data);location.reload();
    }catch(err){console.error("visualize skip failed",err);}
    finally{saving=false;}
  }

  document.addEventListener("click",e=>{const b=e.target?.closest?.('[data-v2="skip-visual"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();void skip();},true);
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();