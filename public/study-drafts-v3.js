(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before study-drafts-v3.js");

  const KEY="lexiflow-study-drafts-v2";
  const LEGACY_ACTIVE_KEY="lexiflow-study-active-v2";
  let data=null;
  let queued=false;

  const load=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||"{}");return value&&typeof value==="object"?value:{};}catch{return {};}};
  const save=value=>{try{localStorage.setItem(KEY,JSON.stringify(value));}catch{}};
  const get=id=>load()[id]||{};
  const patch=(id,next)=>{const all=load();all[id]={...(all[id]||{}),...next,updatedAt:new Date().toISOString()};save(all);};

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

  function currentCard(){
    if(!data?.cards)return null;
    const id=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!id)return null;
    return data.cards.find(item=>String(item.id)===id)||null;
  }

  function restore(){
    const card=currentCard();
    if(!card)return;
    const stage=core.canonicalStage(card);
    const draft=get(card.id);
    const visual=document.getElementById("visual-note");
    if(visual&&stage==="visualize"&&!visual.value&&draft.visual){
      visual.value=draft.visual;
      visual.dispatchEvent(new Event("input",{bubbles:true}));
    }
  }

  function cleanup(){
    if(!data?.cards)return;
    const all=load();
    let changed=false;
    for(const [id,draft] of Object.entries(all)){
      const card=data.cards.find(item=>String(item.id)===String(id));
      if(!card){delete all[id];changed=true;continue;}
      const stage=core.canonicalStage(card);
      if(draft.visual&&stage!=="visualize"){delete draft.visual;changed=true;}
      // Apply V3 has an explicit “save draft and exit” contract. Old automatic
      // localStorage drafts can otherwise resurrect stale test text (for example
      // a previous random input) as if it were the default sentence.
      if(draft.apply){delete draft.apply;changed=true;}
      if(!Object.keys(draft).filter(key=>key!=="updatedAt").length){delete all[id];changed=true;}
    }
    if(changed)save(all);
  }

  document.addEventListener("input",event=>{
    const element=event.target;
    if(!(element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement))return;
    syncFromGateway();
    const card=currentCard();
    if(!card)return;
    const stage=core.canonicalStage(card);
    if(element.id==="visual-note"&&stage==="visualize")patch(card.id,{visual:element.value});
  },true);

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="finish-visual"],[data-action="pass-apply"]');
    if(!button)return;
    setTimeout(()=>{syncFromGateway();cleanup();},900);
  },true);

  function decorate(){cleanup();restore();}
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;syncFromGateway();decorate();});
  }

  function start(){
    try{localStorage.removeItem(LEGACY_ACTIVE_KEY);}catch{}
    const app=document.getElementById("app");
    if(!app)return;
    syncFromGateway();
    if(data)decorate();else void refresh(true).then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
