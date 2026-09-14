from pathlib import Path
p=Path(__file__).resolve().parents[1]/'public/app.js'
s=p.read_text(encoding='utf-8')
old1='const plan=state.data.dailyPlan||core?.buildDailyPlan?.(state.data,new Date());'
old2='const currentPlan=state.data.dailyPlan||core?.buildDailyPlan?.(state.data,nowDate);'
if old1 not in s or old2 not in s:
    raise SystemExit('expected temporary Today plan fallback anchors not found')
s=s.replace(old1,'const plan=state.data.dailyPlan;',1)
s=s.replace(old2,'const currentPlan=state.data.dailyPlan;',1)
if 'buildDailyPlan?.' in s:
    raise SystemExit('app.js still contains a DailyPlan construction fallback')
p.write_text(s,encoding='utf-8')
print('removed app-shell DailyPlan construction fallback')
