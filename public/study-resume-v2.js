(() => {
  "use strict";
  const KEY="lexiflow-study-drafts-v2";
  const ACTIVE_KEY="lexiflow-study-active-v2";
  let data=null, queued=false, autoResuming=false;

  const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"{}");return x&&typeof x==="object"?x:{};}catch{return {};}};
  const save=x=>{try{localStorage.setItem(KEY,JSON.stringify(x));}catch{}};
  const get=id=>load()[id]||{};
  const patch=(id,next)=>{const all=load();all[id]={...(all[id]||{}),...next,updatedAt:new Date().toISOString()};save(all);};
  const active=()=>{try{return JSON.parse(localStorage.getItem(ACTIVE_KEY)||"null");}catch{return null;}};
  const setActive=value=>{try{value?localStorage.setItem(ACTIVE_KEY,JSON.stringify({...value,updatedAt:new Date().toISOString()})):localStorage.removeItem(ACTIVE_KEY);}catch{}};
  const dayKey=(input=new Date())=>{const d=input instanceof Date?input:new Date(input);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};

  async function refresh(){
    try{const r=await fetch("/api/learning-data",{cache:"no-store"});if(r.ok){const p=await r.json();if(p?.data?.cards)data=p.data;}}catch{}
  }

  function currentCard(){
    if(!data?.cards)return null;
    const explicit=document.querySelector("[data-lexi-mem-word]")?.dataset.lexiMemWord;
    const word=String(explicit||document.querySelector(".target-word-text,.apply-word-hero strong,.word-title,.lexi-m2-word strong")?.textContent||"").trim().toLowerCase();
    if(word){const c=data.cards.find(x=>String(x.word||"").trim().toLowerCase()===word);if(c)return c;}
    const visual=document.getElementById("visual-note");if(visual){const c=data.cards.filter(x=>x.stage==="visualize");if(c.length===1)return c[0];}
    const apply=document.getElementById("apply-text");if(apply){const c=data.cards.filter(x=>x.stage==="apply");if(c.length===1)return c[0];}
    return null;
  }

  function restore(){
    const card=currentCard();if(!card)return;const d=get(card.id);
    const visual=document.getElementById("visual-note");if(visual&&card.stage==="visualize"&&!visual.value&&d.visual){visual.value=d.visual;visual.dispatchEvent(new Event("input",{bubbles:true}));}
    const apply=document.getElementById("apply-text");if(apply&&card.stage==="apply"&&!apply.value&&d.apply){apply.value=d.apply;apply.dispatchEvent(new Event("input",{bubbles:true}));}
  }

  function trackActiveStudy(){
    if(!document.querySelector(".study-card-focus"))return;
    const card=currentCard();if(!card)return;
    if(["select","memorize1","memorize2","visualize","apply"].includes(card.stage))setActive({cardId:card.id,stage:card.stage});
  }

  function cleanup(){
    if(!data?.cards)return;const all=load();let changed=false;
    for(const [id,d] of Object.entries(all)){
      const c=data.cards.find(x=>x.id===id);if(!c){delete all[id];changed=true;continue;}
      if(d.visual&&c.stage!=="visualize"){delete d.visual;changed=true;}
      if(d.apply&&c.stage!=="apply"){delete d.apply;changed=true;}
      if(!Object.keys(d).filter(k=>k!=="updatedAt").length){delete all[id];changed=true;}
    }
    if(changed)save(all);
    const a=active();if(a){const c=data.cards.find(x=>x.id===a.cardId);if(!c||c.stage!==a.stage)setActive(null);}
  }

  function resumeIfNeeded(){
    const a=active();if(!a||autoResuming||document.querySelector(".study-card-focus"))return;
    const home=Array.from(document.querySelectorAll("h1,h2")).some(x=>x.textContent.trim()==="今日学习");if(!home)return;
    const card=data?.cards?.find(x=>x.id===a.cardId);if(!card||card.stage!==a.stage){setActive(null);return;}
    if(card.stageEligibleOn&&dayKey(card.stageEligibleOn)>dayKey())return;
    const button=document.querySelector('[data-action="continue-learning"]');if(button&&!button.disabled){autoResuming=true;setTimeout(()=>{button.click();autoResuming=false;},120);}
  }

  document.addEventListener("input",e=>{
    const el=e.target;if(!(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement))return;const card=currentCard();if(!card)return;
    if(el.id==="visual-note")patch(card.id,{visual:el.value});
    if(el.id==="apply-text")patch(card.id,{apply:el.value});
  },true);

  document.addEventListener("click",e=>{
    const exit=e.target?.closest?.('[data-route="home"]');if(exit&&document.querySelector(".study-card-focus"))setActive(null);
    const btn=e.target?.closest?.('[data-action="finish-visual"],[data-action="pass-apply"]');if(!btn)return;
    setTimeout(async()=>{await refresh();cleanup();},900);
  },true);

  function decorate(){cleanup();trackActiveStudy();restore();resumeIfNeeded();}
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});}
  function start(){const app=document.getElementById("app");if(!app)return;void refresh().then(decorate);new MutationObserver(schedule).observe(app,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
