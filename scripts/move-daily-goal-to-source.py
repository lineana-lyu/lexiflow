from pathlib import Path

app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='''        <div class="setting-row">
          <div><h3>每日学习目标</h3><p></p></div>
          <select class="select" id="daily-goal" style="width:130px">${[3,5,8,10,15].map(n=>`<option value="${n}" ${state.data.settings.dailyGoal===n?"selected":""}>${n} 个词</option>`).join("")}</select>
        </div>'''
new='''        <div class="setting-row">
          <div><h3>每日学习目标</h3><p></p></div>
          <div class="daily-goal-editor" data-daily-goal-editor>
            <button type="button" class="goal-step" data-daily-goal-step="-1" aria-label="减少每日学习目标">−</button>
            <label><input id="daily-goal" class="daily-goal-number" type="number" min="1" max="100" step="1" value="${Math.max(1,Math.min(100,Math.round(Number(state.data.settings.dailyGoal||3))))}" aria-label="每日学习目标"><span>个词 / 天</span></label>
            <button type="button" class="goal-step" data-daily-goal-step="1" aria-label="增加每日学习目标">＋</button>
          </div>
        </div>'''
if app.count(old)!=1:
    raise SystemExit(f"legacy daily-goal select block count was {app.count(old)}")
app=app.replace(old,new,1)

old_bind='''    const goal=document.getElementById("daily-goal");
    if(goal) goal.addEventListener("change",e=>{state.data.settings.dailyGoal=Number(e.target.value);saveData();toast("每日目标已更新");});'''
new_bind='''    const goal=document.getElementById("daily-goal");
    if(goal){
      const commitGoal=()=>{
        let value=Math.round(Number(goal.value||state.data.settings.dailyGoal||3));
        value=Math.max(1,Math.min(100,Number.isFinite(value)?value:3));
        goal.value=String(value);
        state.data.settings.dailyGoal=value;
        saveData();
        toast("每日目标已更新");
      };
      goal.addEventListener("change",commitGoal);
      goal.addEventListener("keydown",event=>{
        if(event.key!=="Enter")return;
        event.preventDefault();
        commitGoal();
      });
      document.querySelectorAll("[data-daily-goal-step]").forEach(button=>button.addEventListener("click",()=>{
        const step=Number(button.dataset.dailyGoalStep||0);
        const current=Number(goal.value||state.data.settings.dailyGoal||3);
        goal.value=String(Math.max(1,Math.min(100,Math.round((Number.isFinite(current)?current:3)+step))));
        commitGoal();
      }));
    }'''
if app.count(old_bind)!=1:
    raise SystemExit(f"legacy daily-goal change handler count was {app.count(old_bind)}")
app=app.replace(old_bind,new_bind,1)

for retired in [
    '<select class="select" id="daily-goal"',
    '[3,5,8,10,15].map',
]:
    if retired in app:
        raise SystemExit(f"retired daily-goal source remains: {retired}")
for required in [
    'data-daily-goal-editor',
    'data-daily-goal-step="-1"',
    'data-daily-goal-step="1"',
    'class="daily-goal-number"',
    'state.data.settings.dailyGoal=value',
    'saveData()',
]:
    if required not in app:
        raise SystemExit(f"source-owned daily-goal capability missing: {required}")
app_path.write_text(app,encoding="utf-8")

ux_path=Path("public/product-ux.js")
ux=ux_path.read_text(encoding="utf-8")
const_line='  const CUSTOM_GOAL_KEY = "lexiflow-daily-goal-custom-v1";\n'
if ux.count(const_line)!=1:
    raise SystemExit(f"CUSTOM_GOAL_KEY declaration count was {ux.count(const_line)}")
ux=ux.replace(const_line,"",1)

start='  function rowByTitle(list, title) {'
end='  function extractJobWord(pill) {'
if ux.count(start)!=1 or ux.count(end)!=1:
    raise SystemExit("daily-goal decorator range anchors are not unique")
a=ux.index(start); b=ux.index(end,a)
ux=ux[:a]+ux[b:]

old_decorate='''  function decorate() {
    decorateSpeakers();
    decorateSettings();
  }'''
new_decorate='''  function decorate() {
    decorateSpeakers();
  }'''
if ux.count(old_decorate)!=1:
    raise SystemExit(f"product decorate Settings call block count was {ux.count(old_decorate)}")
ux=ux.replace(old_decorate,new_decorate,1)

for retired in [
    "CUSTOM_GOAL_KEY",
    "decorateDailyGoal",
    "decorateSettings",
    "rowByTitle",
    'fetch("/api/learning-data"',
    "lexiflow-daily-goal-custom-v1",
    "daily-goal-native-select",
]:
    if retired in ux:
        raise SystemExit(f"retired runtime daily-goal logic remains: {retired}")
for required in ["decorateSpeakers","openImageWorkspaceFromJob","MutationObserver","speakerSvg"]:
    if required not in ux:
        raise SystemExit(f"active Product UX capability missing: {required}")
ux_path.write_text(ux,encoding="utf-8")

check_path=Path("scripts/check-runtime-authority-v3.js")
check=check_path.read_text(encoding="utf-8")
old_assert='assert(productUx.includes("decorateDailyGoal"),"product-ux must retain the active daily-goal enhancement");'
new_assert='''assert(!productUx.includes("decorateDailyGoal")&&!productUx.includes("CUSTOM_GOAL_KEY")&&!productUx.includes('/api/learning-data'),"product-ux must not own Daily Goal state or duplicate learning-data reads");
assert(app.includes('data-daily-goal-editor')&&app.includes('data-daily-goal-step="-1"')&&app.includes('data-daily-goal-step="1"'),"app.js must natively own the Daily Goal number editor");'''
if check.count(old_assert)!=1:
    raise SystemExit(f"daily-goal authority assertion count was {check.count(old_assert)}")
check=check.replace(old_assert,new_assert,1)
check_path.write_text(check,encoding="utf-8")

cleanup_path=Path("scripts/check-runtime-cleanup-v3.js")
cleanup=cleanup_path.read_text(encoding="utf-8")
anchor='assert(!product.includes("cloneJsonResponse"),"new-user defaults must not be implemented by product-level response rewriting");'
addition='''\nassert(!product.includes("CUSTOM_GOAL_KEY")&&!product.includes("decorateDailyGoal"),"product UX must not mirror Daily Goal state outside app.js");\nassert(!product.includes('/api/learning-data'),"product UX must not issue learning-data reads for presentation decoration");\nassert(app.includes('data-daily-goal-editor')&&app.includes('id="daily-goal"'),"app.js must directly render the Daily Goal editor");'''
if cleanup.count(anchor)!=1:
    raise SystemExit("runtime cleanup product anchor not uniquely found")
if "must not mirror Daily Goal state outside app.js" not in cleanup:
    cleanup=cleanup.replace(anchor,anchor+addition,1)
cleanup_path.write_text(cleanup,encoding="utf-8")
