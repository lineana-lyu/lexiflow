(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before studyday-boundary-v2.js");

  const RUNTIME_KEY="lexiflow-studyday-runtime-v2";
  const MEMORIZE_KEY="lexiflow-memorize-v2";
  const ACTIVE_STUDY_KEY="lexiflow-study-active-v2";
  const REVIEW_ATTEMPT_KEY="lexiflow-review-resume-v2";
  const REVIEW_SESSION_KEY="lexiflow-review-session-state-v2";

  const safeParse=(raw,fallback)=>{try{return JSON.parse(raw);}catch{return fallback;}};
  const dayOf=value=>{
    if(!value)return"";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?"":core.dayKey(d);
  };

  function purgeMemorize(today){
    try{
      const all=safeParse(localStorage.getItem(MEMORIZE_KEY)||"{}",{});
      let changed=false;
      for(const [id,session] of Object.entries(all||{})){
        const sessionDay=String(session?.date||"")||dayOf(session?.updatedAt);
        if(sessionDay!==today){delete all[id];changed=true;}
      }
      if(changed){
        if(Object.keys(all).length)localStorage.setItem(MEMORIZE_KEY,JSON.stringify(all));
        else localStorage.removeItem(MEMORIZE_KEY);
      }
    }catch{}
  }

  function purgeSingle(key,today,dayResolver){
    try{
      const value=safeParse(localStorage.getItem(key)||"null",null);
      if(!value)return;
      const storedDay=dayResolver(value);
      if(storedDay!==today)localStorage.removeItem(key);
    }catch{}
  }

  function purgeTaskUiState(today){
    purgeMemorize(today);
    purgeSingle(ACTIVE_STUDY_KEY,today,value=>String(value?.date||"")||dayOf(value?.updatedAt));
    purgeSingle(REVIEW_ATTEMPT_KEY,today,value=>String(value?.active?.date||"")||dayOf(value?.active?.updatedAt));
    purgeSingle(REVIEW_SESSION_KEY,today,value=>String(value?.date||""));
  }

  function storedRuntimeDay(){
    try{return String(localStorage.getItem(RUNTIME_KEY)||"");}catch{return"";}
  }
  function storeRuntimeDay(day){try{localStorage.setItem(RUNTIME_KEY,day);}catch{}}

  let runtimeDay=core.dayKey(new Date());
  const previous=storedRuntimeDay();
  if(previous!==runtimeDay)purgeTaskUiState(runtimeDay);
  storeRuntimeDay(runtimeDay);

  function checkBoundary(){
    const current=core.dayKey(new Date());
    if(current===runtimeDay)return;
    runtimeDay=current;
    purgeTaskUiState(current);
    storeRuntimeDay(current);
    location.reload();
  }

  window.addEventListener("focus",checkBoundary);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkBoundary();});
  setInterval(checkBoundary,30000);
})();
