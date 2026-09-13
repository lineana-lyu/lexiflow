(() => {
  "use strict";

  const core=window.LexiFlowLearningCore;
  if(!core)throw new Error("LexiFlowLearningCore must load before review-policy-v3.js");

  let latestData=null;
  let scheduled=false;

  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      latestData=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return latestData;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        if(payload?.data)latestData=core.normalizeData(payload.data);
      }
    }catch{}
    return latestData;
  }

  function planOf(){return latestData?.dailyPlan||null;}
  function numberOr(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
  function goalText(plan){
    const base=Math.max(0,numberOr(plan?.selectMaxGoal,latestData?.settings?.dailyGoal||3));
    const goal=Math.max(0,numberOr(plan?.selectGoal,base));
    const reviewCount=Math.max(0,numberOr(plan?.reviewCriticalCount,0))+Math.max(0,numberOr(plan?.reviewStableScheduledCount,0));
    if(reviewCount===0)return `今天没有复习任务，新词最多 ${goal} 个。`;
    if(goal===0)return `今天安排 ${reviewCount} 个复习，先巩固旧词，暂不增加新词。`;
    if(goal<base)return `今天安排 ${reviewCount} 个复习，新词自动调整为最多 ${goal} 个。`;
    return `今天安排 ${reviewCount} 个复习，新词最多 ${goal} 个。`;
  }

  function decorateToday(){
    const plan=planOf();if(!plan)return;
    const reviewRow=document.querySelector('#lexi-today-plan [data-plan-key="review"]');
    const recent=Math.max(0,numberOr(plan.reviewCriticalCount,0));
    const longTerm=Math.max(0,numberOr(plan.reviewStableScheduledCount,0));
    if(reviewRow){
      const count=reviewRow.querySelector(".lexi-plan-count");
      if(count)count.title=`今天需要复习 ${recent+longTerm} 个词，其中 ${recent} 个近期巩固、${longTerm} 个长期巩固。`;
    }
    const goalRow=document.querySelector('#lexi-today-plan [data-plan-key="select-goal"]');
    if(goalRow)goalRow.title=goalText(plan);
  }

  function decorate(){decorateToday();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncFromGateway();decorate();});}
  function start(){
    const app=document.getElementById("app");if(!app)return;
    syncFromGateway();
    if(latestData)decorate();else void refresh(true).then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener("lexiflow:today-plan-data",schedule);
    window.addEventListener("focus",()=>void refresh(true).then(decorate));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
