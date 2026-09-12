(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before daily-plan-persistence-v3.js");

  let running=false;

  function markerFor(data){
    const plan=data?.dailyPlan;
    if(!plan?.frozen||!plan.date||!plan.planVersion)return "";
    return `${plan.date}:${plan.planVersion}:${plan.generatedAt||""}`;
  }

  async function persistFrozenPlan(){
    if(running)return false;
    running=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(!response.ok)throw new Error("DAILY_PLAN_READ_FAILED");
      const payload=await response.json();
      if(!payload?.data)return false;

      const normalized=core.normalizeData(payload.data);
      const marker=markerFor(normalized);
      if(!marker)return false;
      if(normalized.dailyPlanPersistedKey===marker)return true;

      const next=JSON.parse(JSON.stringify(normalized));
      next.dailyPlanPersistedKey=marker;
      const saved=await fetch("/api/learning-data",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({data:next,dailyPlanAuthority:"v3"}),
      });
      if(!saved.ok)throw new Error("DAILY_PLAN_PERSIST_FAILED");
      return true;
    }catch(err){
      console.error("daily plan persistence failed",err);
      return false;
    }finally{
      running=false;
    }
  }

  function start(){void persistFrozenPlan();}

  window.LexiFlowDailyPlanPersistenceV3=Object.freeze({persist:persistFrozenPlan});

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
