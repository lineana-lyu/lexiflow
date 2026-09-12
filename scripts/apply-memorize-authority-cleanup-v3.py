from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'public'/'app.js'
MEM=ROOT/'public'/'memorize-v2.js'
CHECK=ROOT/'scripts'/'check-runtime-authority-v3.js'
DOCS=ROOT/'docs'/'RUNTIME_AUTHORITY_V3.md'


def once(source,old,new,label):
    count=source.count(old)
    if count!=1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return source.replace(old,new,1)


def between(source,start,end,replacement,label):
    a=source.find(start)
    if a<0: raise RuntimeError(f'{label}: start not found')
    if source.find(start,a+len(start))>=0: raise RuntimeError(f'{label}: start not unique')
    b=source.find(end,a+len(start))
    if b<0: raise RuntimeError(f'{label}: end not found')
    return source[:a]+replacement+source[b:]

app=APP.read_text(encoding='utf-8')
app=once(app,
'''    if(stage==="select") return stageSelect(card);
    if(stage==="memorize1") return stageMem1(card);
    if(stage==="memorize2") return stageMem2(card);
    if(stage==="visualize") return stageVisual(card);''',
'''    if(stage==="select") return stageSelect(card);
    if(stage==="memorize1"||stage==="memorize2") return `<div class="study-center" data-lexi-memorize-shell="${escapeHtml(card.id)}"><span class="prompt-small">正在准备双向记忆练习…</span></div>`;
    if(stage==="visualize") return stageVisual(card);''',
'replace legacy Memorize renderer entry')
app=between(app,
'''  function stageMem1(card){''',
'''const visualProgressTimers=new Map();''',
'',
'remove legacy Memorize renderers')
app=between(app,
'''  function advanceStage(card,next,meta={}){''',
'''  function reviewPage(){''',
'',
'remove legacy stage mutation helper')
app=between(app,
'''    if(action==="complete-stage"){
      const c=getCard(state.study.cardId);advanceStage(c,el.dataset.next);return;
    }
    if(action==="reveal"){state.study.revealed=true;render();return;}
    if(action==="memory-rate"){''',
'''    if(action==="toggle-visual-scene"){''',
'''    if(action==="complete-stage"){
      showNotice("学习阶段没有正常保存","Select 完成应由当前学习引擎写入明天的 Memorize 计划。本次不会使用旧的同日跳转逻辑。","warn");
      return;
    }
''',
'retire legacy Memorize handlers')
app=between(app,
'''  if(action==="finish-visual"){
    const c=getCard(state.study.cardId);''',
'''  if(action==="submit-apply"){''',
'''  if(action==="finish-visual"){
    showNotice("学习阶段没有正常保存","Visualize 完成应由当前学习引擎写入明天的 Apply 计划。本次不会使用旧的同日跳转逻辑。","warn");
    return;
  }
''',
'retire legacy Visualize stage mutation fallback')
APP.write_text(app,encoding='utf-8')

mem=MEM.read_text(encoding='utf-8')
mem=once(mem,
'''  function currentCard(){
    if(!data?.cards)return null;
    const explicit=document.querySelector("[data-lexi-mem-word]")?.dataset.lexiMemWord;
    const word=(explicit||document.querySelector(".target-word-text")?.textContent||"").trim().toLowerCase();
    if(word){ const c=data.cards.find(x=>String(x.word||"").trim().toLowerCase()===word); if(c)return c; }
    const zh=String(document.querySelector(".chinese-memory-prompt")?.textContent||"").trim();
    if(zh)return data.cards.find(x=>["memorize1","memorize2"].includes(x.stage)&&String(x.meaningZh||"").trim()===zh)||null;
    return null;
  }''',
'''  function currentCard(){
    if(!data?.cards)return null;
    const activeId=String(window.LexiFlowStudyRenderer?.currentCardId?.()||"");
    if(!activeId)return null;
    const card=data.cards.find(item=>item.id===activeId)||null;
    return card&&["memorize1","memorize2"].includes(card.stage)?card:null;
  }''',
'make Memorize resolve explicit renderer card')
mem=once(mem,
'''  document.addEventListener("click",e=>{
    const b=e.target?.closest?.("[data-m2]"); if(b){e.preventDefault();e.stopImmediatePropagation();void act(b);return;}
    const legacy=e.target?.closest?.('[data-action="memory-rate"],[data-action="reveal"]');
    if(legacy){const c=currentCard();if(c&&["memorize1","memorize2"].includes(c.stage)){e.preventDefault();e.stopImmediatePropagation();render();}}
  },true);''',
'''  document.addEventListener("click",e=>{
    const b=e.target?.closest?.("[data-m2]");
    if(b){e.preventDefault();e.stopImmediatePropagation();void act(b);}
  },true);''',
'remove legacy Memorize action compatibility')
MEM.write_text(mem,encoding='utf-8')

check=CHECK.read_text(encoding='utf-8')
check=once(check,
'''const stageTransition=read("public/stage-transition-v2.js");
const app=read("public/app.js");''',
'''const stageTransition=read("public/stage-transition-v2.js");
const memorize=read("public/memorize-v2.js");
const app=read("public/app.js");''',
'load Memorize module in runtime check')
check=once(check,
'''assert(stageTransition.includes("card.initialReviewPending=false"),"Apply completion must retire legacy same-day initial Review");''',
'''assert(stageTransition.includes("card.initialReviewPending=false"),"Apply completion must retire legacy same-day initial Review");
assert(memorize.includes("window.LexiFlowStudyRenderer?.currentCardId?.()"),"Memorize must resolve the exact Study Session renderer card ID");
assert(!memorize.includes("chinese-memory-prompt"),"Memorize must not infer its card from legacy DOM content");
assert(!memorize.includes('[data-action=\\"memory-rate\\"]'),"Memorize must not depend on legacy memory-rate controls");
for(const legacy of ["function stageMem1(","function stageMem2(","function advanceStage("]){assert(!app.includes(legacy),`legacy learning-stage authority must be removed from app.js: ${legacy}`);}
assert(!app.includes('if(action===\\"memory-rate\\")'),"app.js must not retain legacy Memorize rating authority");
assert(!app.includes('if(action===\\"reveal\\")'),"app.js must not retain legacy Memorize reveal state");
assert(app.includes("data-lexi-memorize-shell"),"app.js should expose only a passive Memorize render host");''',
'add Memorize authority assertions')
CHECK.write_text(check,encoding='utf-8')

docs=DOCS.read_text(encoding='utf-8')
docs=once(docs,
'''`stage-transition-v2.js` currently owns persisted completion for Select, Visualize and Apply. It intercepts the legacy UI controls before `app.js` can perform the old same-day transitions and delegates all cross-day gates to Learning Core.

`memorize-v2.js` owns the two-round Memorize behavior and its persisted completion.''',
'''`stage-transition-v2.js` owns persisted completion for Select, Visualize and Apply and delegates all cross-day gates to Learning Core. The generic `app.js` handlers fail closed if those authoritative transitions are unavailable; `app.js` no longer contains its former generic `advanceStage()` mutation path.

`memorize-v2.js` owns both the two-round Memorize UI and persisted completion. It resolves the active card only through `LexiFlowStudyRenderer.currentCardId()`; `app.js` provides a passive Memorize host and no longer contains the old `stageMem1` / `stageMem2` renderers or `memory-rate` state transitions.''',
'document Memorize authority cleanup')
DOCS.write_text(docs,encoding='utf-8')

print('Memorize authority cleanup V3 patch applied.')
