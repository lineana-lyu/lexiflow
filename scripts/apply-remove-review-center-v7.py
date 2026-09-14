from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,text): (ROOT/rel).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    if old not in text: raise SystemExit(f'missing patch target: {label}')
    return text.replace(old,new,1)

rel='public/app.js'
s=read(rel)
s=replace_once(s,'          ${navButton("review","↻","复习中心")}\n','', 'remove review nav')
s=replace_once(s,
'''    const review=Array.isArray(plan?.review)?plan.review.length:0;\n    const learning=["memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);''',
'''    const review=Array.isArray(plan?.review)?plan.review.length:0;\n    const reviewRecent=Math.max(0,Number(plan?.reviewCriticalCount||0));\n    const reviewLongTerm=Math.max(0,Number(plan?.reviewStableScheduledCount||0));\n    const learning=["memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);''',
'home review breakdown')
s=replace_once(s,
'''<div class="card stat"><div class="stat-label">待复习</div><div class="stat-value">${review}</div><div class="stat-hint">系统今天已安排</div></div>''',
'''<div class="card stat"><div class="stat-label">待复习</div><div class="stat-value">${review}</div><div class="stat-hint">${reviewRecent} 个近期巩固 · ${reviewLongTerm} 个长期巩固</div></div>''',
'home review hint')
s=replace_once(s,
'''    else if(state.route==="review") html=reviewPage();''',
'''    else if(state.route==="review"){state.route="home";html=homePage();}''',
'legacy review redirect')
write(rel,s)

rel='scripts/check-user-surface-v4.js'
s=read(rel)
needle='console.log("User surface V4 checks passed");'
assertions='''assert(!app.includes('navButton("review","↻","复习中心")'),"Review Center must not remain a top-level navigation destination");\nassert(app.includes('reviewRecent')&&app.includes('reviewLongTerm')&&app.includes('近期巩固')&&app.includes('长期巩固'),"Today must surface the review breakdown inside the daily plan");\nassert(app.includes('else if(state.route==="review"){state.route="home";html=homePage();}'),"legacy review routes must redirect into Today instead of reopening a second learning entrance");\n'''
if needle not in s: raise SystemExit('missing patch target: user surface console')
s=s.replace(needle,assertions+needle,1)
write(rel,s)
print('Review Center navigation removal staged.')
