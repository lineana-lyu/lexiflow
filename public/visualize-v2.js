(() => {
  "use strict";
  let data=null,queued=false,saving=false;
  const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const tomorrowIso=()=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+1);return d.toISOString();};
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`visual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function refresh(){try{const r=await fetch("/api/learning-data",{cache:"no-store"});if(r.ok){const p=await r.json();if(p?.data?.cards)data=p.data;}}catch{}return data;}
  async function save(next){const r=await fetch("/api/learning-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:next})});if(!r.ok)throw new Error("SAVE_FAILED");}
  function card(){if(!data?.cards)return null;const word=String(document.querySelector(".study-card-focus .target-word-text")?.textContent||"").trim().toLowerCase();if(!word)return null;return data.cards.find(x=>x.stage==="visualize"&&String(x.word||"").trim().toLowerCase()===word)||null;}

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
      await refresh();const c=card();if(!c)return;const note=String(document.getElementById("visual-note")?.value||"").trim();
      c.visualNote=note;c.visualSkipped=true;c.stage="apply";c.stageEligibleOn=tomorrowIso();c.visualizeCompletedOn=dayKey();c.memoryState="learning";c.updatedAt=new Date().toISOString();
      data.activities=Array.isArray(data.activities)?data.activities:[];data.activities.push({id:uid(),type:"stage-complete",cardId:c.id,stage:"visualize",skipped:true,at:new Date().toISOString()});
      await save(data);location.reload();
    }catch{saving=false;}
  }

  document.addEventListener("click",e=>{const b=e.target?.closest?.('[data-v2="skip-visual"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();void skip();},true);
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
