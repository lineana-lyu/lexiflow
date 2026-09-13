from pathlib import Path

advance_path=Path("public/advance-learning-v3.js")
source=advance_path.read_text(encoding="utf-8")

old_refresh='''  async function refresh(){
    if(refreshing)return data;
    refreshing=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data)data=core.normalizeData(payload.data);}
    }catch(err){console.warn("Advance Learning V3 refresh failed",err);}
    finally{refreshing=false;}
    return data;
  }
'''
new_refresh='''  function syncFromGateway(){
    try{
      const current=window.LexiFlowLearningDataGatewayV3?.current?.();
      if(!current?.cards)return false;
      data=core.normalizeData(current);
      return true;
    }catch{return false;}
  }

  async function refresh(force=false){
    if(!force&&syncFromGateway())return data;
    if(refreshing)return data;
    refreshing=true;
    try{
      const response=await fetch("/api/learning-data",{cache:"no-store"});
      if(response.ok){const payload=await response.json();if(payload?.data)data=core.normalizeData(payload.data);}
    }catch(err){console.warn("Advance Learning V3 refresh failed",err);}
    finally{refreshing=false;}
    return data;
  }
'''
if source.count(old_refresh)!=1:
    raise SystemExit(f"Advance refresh block count was {source.count(old_refresh)}")
source=source.replace(old_refresh,new_refresh,1)

old_unlock='''      await refresh();
      const now=new Date(),today=core.dayKey(now);'''
new_unlock='''      await refresh(true);
      const now=new Date(),today=core.dayKey(now);'''
if source.count(old_unlock)!=1:
    raise SystemExit(f"Advance unlock refresh count was {source.count(old_unlock)}")
source=source.replace(old_unlock,new_unlock,1)

old_schedule='''  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      await refresh();
      decorate();
    });
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    void refresh().then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  }

  window.LexiFlowAdvanceLearningV3=Object.freeze({
    refresh:async()=>{await refresh();decorate();return data;},
    unlock(cardId){return unlock(String(cardId||""),null);}
  });
'''
new_schedule='''  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      syncFromGateway();
      decorate();
    });
  }

  function start(){
    const app=document.getElementById("app");
    if(!app)return;
    syncFromGateway();
    if(data)decorate();else void refresh(true).then(decorate);
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.LexiFlowLearningDataGatewayV3?.registerAfterPersist?.(()=>schedule());
    window.addEventListener("lexiflow:today-plan-data",schedule);
  }

  window.LexiFlowAdvanceLearningV3=Object.freeze({
    refresh:async()=>{await refresh(true);decorate();return data;},
    unlock(cardId){return unlock(String(cardId||""),null);}
  });
'''
if source.count(old_schedule)!=1:
    raise SystemExit(f"Advance schedule/start block count was {source.count(old_schedule)}")
source=source.replace(old_schedule,new_schedule,1)

for required in [
    "function syncFromGateway()",
    "LexiFlowLearningDataGatewayV3?.current?.()",
    "if(!force&&syncFromGateway())return data;",
    "await refresh(true);",
    "requestAnimationFrame(()=>{",
    "syncFromGateway();\n      decorate();",
    "registerAfterPersist?.(()=>schedule())",
    'window.addEventListener("lexiflow:today-plan-data",schedule)',
]:
    if required not in source:
        raise SystemExit(f"Advance Gateway-first contract missing: {required}")
for retired in [
    "requestAnimationFrame(async()=>{",
    "await refresh();\n      decorate();",
    "void refresh().then(decorate)",
]:
    if retired in source:
        raise SystemExit(f"Advance mutation-driven network refresh remains: {retired}")
advance_path.write_text(source,encoding="utf-8")

check_path=Path("scripts/check-advance-learning-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='''assert(moduleSource.includes('advanceLearningAuthority:"v3"'),"Advance Learning V3 persistence must identify its authority");'''
addition='''
assert(moduleSource.includes("function syncFromGateway()")&&moduleSource.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Advance Learning V3 must reuse the canonical Gateway snapshot for presentation redraws");
assert(moduleSource.includes("if(!force&&syncFromGateway())return data;"),"Advance Learning V3 refresh must avoid redundant learning-data GETs when Gateway data exists");
assert(moduleSource.includes("await refresh(true);"),"explicit early-learning unlock must force a fresh source read before mutating the frozen plan");
assert(moduleSource.includes("requestAnimationFrame(()=>{")&&moduleSource.includes("syncFromGateway();")&&moduleSource.includes("decorate();"),"Advance Learning MutationObserver redraws must stay memory-only");
assert(!moduleSource.includes("requestAnimationFrame(async()=>{"),"Advance Learning MutationObserver must not restore network refreshes on DOM mutation");
assert(moduleSource.includes('fetch("/api/learning-data",{cache:"no-store"})'),"Advance Learning must retain a cold/fresh GET fallback for explicit refreshes and writes");'''
if check.count(anchor)!=1:
    raise SystemExit("Advance Learning Gateway-first assertion anchor not unique")
if "must reuse the canonical Gateway snapshot for presentation redraws" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
