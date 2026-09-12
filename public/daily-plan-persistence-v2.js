(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);
  let persisting = false;

  function endpointOf(input){
    try{return new URL(typeof input==="string"?input:input?.url||"",location.href).pathname;}catch{return "";}
  }
  function markerFor(data){
    const plan=data?.dailyPlan;
    if(!plan?.frozen||!plan.date||!plan.planVersion)return "";
    return `${plan.date}:${plan.planVersion}:${plan.generatedAt||""}`;
  }

  async function persistIfNeeded(payload){
    if(persisting||!payload?.data)return;
    const data=payload.data, marker=markerFor(data);
    if(!marker||data.dailyPlanPersistedKey===marker)return;
    persisting=true;
    try{
      const next=JSON.parse(JSON.stringify(data));
      next.dailyPlanPersistedKey=marker;
      const response=await previousFetch("/api/learning-data",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({data:next}),
      });
      if(!response.ok)throw new Error("DAILY_PLAN_PERSIST_FAILED");
      payload.data.dailyPlanPersistedKey=marker;
    }catch(err){
      console.error("daily plan persistence failed",err);
    }finally{
      persisting=false;
    }
  }

  window.fetch=async function lexiFlowDailyPlanPersistenceFetch(input,init={}){
    const response=await previousFetch(input,init);
    const endpoint=endpointOf(input), method=String(init?.method||"GET").toUpperCase();
    if(endpoint!=="/api/learning-data"||method!=="GET"||!response.ok)return response;
    try{
      const payload=await response.clone().json();
      if(payload?.data){
        await persistIfNeeded(payload);
        const headers=new Headers(response.headers||{});
        headers.set("Content-Type","application/json; charset=utf-8");
        headers.delete("Content-Length");
        return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
      }
    }catch{}
    return response;
  };
})();