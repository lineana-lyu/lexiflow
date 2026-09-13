from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")

old_save='''.then(()=>api("/api/learning-data",{method:"POST",body:{data:snapshot}}))'''
new_save='''.then(()=>api("/api/learning-data",{method:"POST",body:{data:snapshot,appShellAuthority:"v1"}}))'''
if app.count(old_save)!=1:
    raise SystemExit(f"base app save POST count was {app.count(old_save)}")
app=app.replace(old_save,new_save,1)

old_duplicate='''state.data.cards.unshift(card);recordActivity("card-created",card.id);saveData();toast("卡片已保存，已进入学习流程");'''
new_duplicate='''state.data.cards.unshift(card);recordActivity("card-created",card.id);toast("卡片已保存，已进入学习流程");'''
if app.count(old_duplicate)!=1:
    raise SystemExit(f"new-card duplicate save sequence count was {app.count(old_duplicate)}")
app=app.replace(old_duplicate,new_duplicate,1)

old_unload='''  window.addEventListener("beforeunload",()=>{
    if(!persistenceReady)return;
    try{
      const body=JSON.stringify({data:state.data});
      navigator.sendBeacon("/api/learning-data",new Blob([body],{type:"application/json"}));
    }catch{}
  });'''
new_unload='''  window.addEventListener("beforeunload",()=>{
    if(!persistenceReady)return;
    try{
      const body=JSON.stringify({data:state.data,appShellAuthority:"v1",reason:"beforeunload"});
      void fetch("/api/learning-data",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body,
        keepalive:true,
      }).catch(()=>{});
    }catch{}
  });'''
if app.count(old_unload)!=1:
    raise SystemExit(f"legacy beforeunload sendBeacon block count was {app.count(old_unload)}")
app=app.replace(old_unload,new_unload,1)

for retired in [
    'navigator.sendBeacon("/api/learning-data"',
    'recordActivity("card-created",card.id);saveData();',
]:
    if retired in app:
        raise SystemExit(f"retired app persistence path remains: {retired}")
for required in [
    'appShellAuthority:"v1"',
    'reason:"beforeunload"',
    'keepalive:true',
    'void fetch("/api/learning-data"',
]:
    if required not in app:
        raise SystemExit(f"Gateway-routed app persistence contract missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-learning-data-gateway-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='''assert(app.includes("learningDataGateway.registerAfterPersist")&&app.includes("state.data=normalizeLearningData(snapshot)"),"base app state must follow Gateway-confirmed persistence so generic full-data saves cannot revive a stale snapshot");'''
addition='''
assert(app.includes('appShellAuthority:"v1"'),"base app learning-data writes must identify their authority for persistence diagnostics");
assert(!app.includes('navigator.sendBeacon("/api/learning-data"'),"base app must not bypass the Learning Data Gateway with a direct learning-data beacon");
assert(app.includes('void fetch("/api/learning-data"')&&app.includes("keepalive:true")&&app.includes('reason:"beforeunload"'),"beforeunload persistence must stay on the Gateway-observed fetch path while requesting keepalive delivery");
assert(!app.includes('recordActivity("card-created",card.id);saveData();'),"new-card creation must not enqueue a duplicate whole-data save after recordActivity already persists the mutation");'''
if check.count(anchor)!=1:
    raise SystemExit("Gateway check base-app persistence anchor not unique")
if "must not bypass the Learning Data Gateway with a direct learning-data beacon" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
