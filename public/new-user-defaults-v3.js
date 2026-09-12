(() => {
  "use strict";

  const MIGRATION_KEY="lexiflow-new-user-defaults-v3";
  const TARGET_GOAL=3;

  function marked(){try{return localStorage.getItem(MIGRATION_KEY)==="1";}catch{return false;}}
  function mark(){try{localStorage.setItem(MIGRATION_KEY,"1");}catch{}}

  async function applyFreshDefaults(){
    if(marked())return;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(!response.ok)return;
      const payload=await response.json();
      const data=payload?.data;
      if(!data||payload.hasStoredData!==false){mark();return;}
      if((data.cards||[]).length||(data.activities||[]).length){mark();return;}
      data.settings={...(data.settings||{}),dailyGoal:TARGET_GOAL};
      const saved=await fetch("/api/learning-data",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({data}),
      });
      if(!saved.ok)return;
      mark();
      location.reload();
    }catch(err){
      console.warn("fresh-user defaults were not applied",err);
    }
  }

  function start(){void applyFreshDefaults();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
