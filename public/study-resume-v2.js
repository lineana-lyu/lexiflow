(() => {
  "use strict";

  const KEY="lexiflow-study-drafts-v2";
  const LEGACY_ACTIVE_KEY="lexiflow-study-active-v2";
  let data=null;
  let queued=false;

  const load=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||"{}");return value&&typeof value==="object"?value:{};}catch{return {};}};
  const save=value=>{try{localStorage.setItem(KEY,JSON.stringify(value));}catch{}};
  const get=id=>load()[id]||{};
  const patch=(id,next)=>{const all=load();all[id]={...(all[id]||{}),...next,updatedAt:new Date().toISOString()};save(all);};

  async function refresh(){
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data?.cards)data=payload.data;}
    }catch{}
  }

  function currentCard(){
    if(!data?.cards)return null;
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id)return null;
    return data.cards.find(item=>String(item.id)===id)||null;
  }

  function restore(){
    const card=currentCard();
    if(!card)return;
    const draft=get(card.id);
    const visual=document.getElementById("visual-note");
    if(visual&&card.stage==="visualize"&&!visual.value&&draft.visual){
      visual.value=draft.visual;
      visual.dispatchEvent(new Event("input",{bubbles:true}));
    }
    const apply=document.getElementById("apply-text");
    if(apply&&card.stage==="apply"&&!apply.value&&draft.apply){
      apply.value=draft.apply;
      apply.dispatchEvent(new Event("input",{bubbles:true}));
    }
  }

  function cleanup(){
    if(!data?.cards)return;
    const all=load();
    let changed=false;
    for(const [id,draft] of Object.entries(all)){
      const card=data.cards.find(item=>item.id===id);
      if(!card){delete all[id];changed=true;continue;}
      if(draft.visual&&card.stage!=="visualize"){delete draft.visual;changed=true;}
      if(draft.apply&&card.stage!=="apply"){delete draft.apply;changed=true;}
      if(!Object.keys(draft).filter(key=>key!=="updatedAt").length){delete all[id];changed=true;}
    }
    if(changed)save(all);
  }

  document.addEventListener("input",event=>{
    const element=event.target;
    if(!(element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement))return;
    const card=currentCard();
    if(!card)return;
    if(element.id==="visual-note")patch(card.id,{visual:element.value});
    if(element.id==="apply-text")patch(card.id,{apply:element.value});
  },true);

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="finish-visual"],[data-action="pass-apply"]');
    if(!button)return;
    setTimeout(async()=>{await refresh();cleanup();},900);
  },true);

  function decorate(){cleanup();restore();}
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(async()=>{queued=false;await refresh();decorate();});
  }

  function start(){
    try{localStorage.removeItem(LEGACY_ACTIVE_KEY);}catch{}
    const app=document.getElementById("app");
    if(!app)return;
    void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
