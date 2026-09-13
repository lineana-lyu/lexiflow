from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='''  function currentDailyPlan(){
    const plan=state.data.dailyPlan;
    if(plan?.frozen===true&&plan.date===todayKey())return plan;
    const core=window.LexiFlowLearningCore;
    return typeof core?.buildDailyPlan==="function"?core.buildDailyPlan(state.data,new Date()):null;
  }
'''
new='''  function currentDailyPlan(){
    const plan=state.data.dailyPlan;
    return plan?.frozen===true&&plan.date===todayKey()?plan:null;
  }
'''
if app.count(old)!=1:
    raise SystemExit(f"legacy app DailyPlan fallback count was {app.count(old)}")
app=app.replace(old,new,1)
if "buildDailyPlan" in app:
    raise SystemExit("app.js still contains DailyPlan construction authority")
for required in [
    "function currentDailyPlan()",
    "plan?.frozen===true",
    "window.LexiFlowStudyRenderer=Object.freeze",
    "data-study-stage-host-v3",
]:
    if required not in app:
        raise SystemExit(f"required app shell contract missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(app.includes("state.study={cardId:card.id};"),"app.js Study bridge state must contain only the exact card identity");'
addition='''
assert(!app.includes("buildDailyPlan"),"app.js must not construct Today membership; frozen DailyPlan is owned by V3");
assert(app.includes("return plan?.frozen===true&&plan.date===todayKey()?plan:null;"),"app.js may only read the already-frozen current DailyPlan");'''
if check.count(anchor)!=1:
    raise SystemExit("Study bridge contract anchor not uniquely found")
if "app.js must not construct Today membership" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
