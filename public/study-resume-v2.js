(() => {
  "use strict";
  const KEY="lexiflow-study-drafts-v2";
  let data=null, queued=false;

  const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"{}");return x&&typeof x==="object"?x:{};}catch{return {};}};
  const save=x=>{try{localStorage.setItem(KEY,JSON.stringify(x));}catch{}};
  const get=id=>load()[id]||{};
  const patch=(id,next)=>{const all=load();all[id]={...(all[id]||{}),...next,updatedAt:new Date().toISOString()};save(all);};
  const clearPart=(id,key)=>{const all=load();if(!all[id])return;delete all[id][key];if(!Object.keys(all[id]).filter(k=>k!=="updatedAt").length)delete all[id];save(all);};

  async function refresh(){
    try{const r=await fetch("/api/learning-data",{cache:"no-store"});if(r.ok){const p=await r.json();if(p?.data?.cards)data=p.data;}}catch{}
  }

  function currentCard(){
    if(!data?.cards)return null;
    const word=String(document.querySelector(".target-word-text,.apply-word-hero strong,.word-title")?.textContent||"").trim().toLowerCase();
    if(word){const c=data.cards.find(x=>String(x.word||"").trim().toLowerCase()===word);if(c)return c;}
    const visual=document.getElementById("visual-note");
    if(visual){const candidates=data.cards.filter(x=>x.stage==="visualize");if(candidates.length===1)return candidates[0];}
    const apply=document.getElementById("apply-text");
    if(apply){const candidates=data.cards.filter(x=>x.stage==="apply");if(candidates.length===1)return candidates[0];}
    return null;
  }

  function restore(){
    const card=currentCard();if(!card)return;const d=get(card.id);
    const visual=document.getElementById("visual-note");
    if(visual&&card.stage==="visualize"&&!visual.value&&d.visual){visual.value=d.visual;visual.dispatchEvent(new Event("input",{bubbles:true}));}
    const apply=document.getElementById("apply-text");
    if(apply&&card.stage==="apply"&&!apply.value&&d.apply){apply.value=d.apply;apply.dispatchEvent(new Event("input",{bubbles:true}));}
  }

  function cleanup(){
    if(!data?.cards)return;const all=load();let changed=false;
    for(const [id,d] of Object.entries(all)){
      const c=data.cards.find(x=>x.id===id);
      if(!c){delete all[id];changed=true;continue;}
      if(d.visual&&c.stage!=="visualize"){delete d.visual;changed=true;}
      if(d.apply&&c.stage!=="apply"){delete d.apply;changed=true;}
      if(!Object.keys(d).filter(k=>k!=="updatedAt").length){delete all[id];changed=true;}
    }
    if(changed)save(all);
  }

  document.addEventListener("input",e=>{
    const el=e.target;if(!(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement))return;
    const card=currentCard();if(!card)return;
    if(el.id==="visual-note")patch(card.id,{visual:el.value});
    if(el.id==="apply-text")patch(card.id,{apply:el.value});
  },true);

  document.addEventListener("click",e=>{
    const btn=e.target?.closest?.('[data-action="finish-visual"],[data-action="pass-apply"]');if(!btn)return;
    const card=currentCard();if(!card)return;
    setTimeout(async()=>{await refresh();cleanup();},900);
  },true);

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();cleanup();restore();});}
  function start(){const app=document.getElementById("app");if(!app)return;void refresh().then(()=>{cleanup();restore();});new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
