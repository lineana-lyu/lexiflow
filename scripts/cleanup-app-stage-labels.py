from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")

old_label='''  function stageLabelOf(stage){
    return ({select:"选词确认",memorize1:"英→中",memorize2:"中→英",visualize:"视觉联想",apply:"造句",review:"复习中",mastered:"已掌握"})[stage]||stage;
  }
'''
new_label='''  function stageLabelOf(card){
    const core=window.LexiFlowLearningCore;
    const stage=typeof core?.canonicalStage==="function"?core.canonicalStage(card):String(card?.stage||"");
    if(card?.memoryState==="stable")return "长期稳定";
    return ({select:"待确认",memorize:"记忆中",visualize:"视觉联想",apply:"造句应用",review:"复习巩固"})[stage]||stage;
  }
'''
if app.count(old_label)!=1:
    raise SystemExit(f"legacy stageLabelOf count was {app.count(old_label)}")
app=app.replace(old_label,new_label,1)
if app.count("stageLabelOf(c.stage)")!=2:
    raise SystemExit(f"stageLabelOf(c.stage) call count was {app.count('stageLabelOf(c.stage)')}")
app=app.replace("stageLabelOf(c.stage)","stageLabelOf(c)")

old_start='''    if(card.inboxPending||card.stage==="review"||card.stage==="mastered"){
      toast("这张卡片当前不能进入首次学习");'''
new_start='''    const canonical=window.LexiFlowLearningCore?.canonicalStage?.(card)||String(card.stage||"");
    if(card.inboxPending||canonical==="review"||card.memoryState==="stable"){
      toast("这张卡片当前不能进入首次学习");'''
if app.count(old_start)!=1:
    raise SystemExit(f"legacy startStudy stage guard count was {app.count(old_start)}")
app=app.replace(old_start,new_start,1)

for legacy in ["memorize1","memorize2","mastered"]:
    if legacy in app:
        raise SystemExit(f"historical product stage remains in app.js: {legacy}")
for required in [
    'core.canonicalStage(card)',
    'card.memoryState==="stable"',
    'memorize:"记忆中"',
    'review:"复习巩固"',
]:
    if required not in app:
        raise SystemExit(f"canonical app stage display contract missing: {required}")
app_path.write_text(app,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(!app.includes("buildDailyPlan"),"app.js must not construct Today membership; frozen DailyPlan is owned by V3");'
addition='''
for(const legacyStage of ["memorize1","memorize2","mastered"]){
  assert(!app.includes(legacyStage),`app.js must not expose a historical product stage: ${legacyStage}`);
}
assert(app.includes("core.canonicalStage(card)"),"app.js display labels must reuse canonical stage normalization");'''
if check.count(anchor)!=1:
    raise SystemExit("DailyPlan authority contract anchor not uniquely found")
if "app.js must not expose a historical product stage" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
