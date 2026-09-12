from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "public" / "app.js"
REVIEW = ROOT / "public" / "review-session-v3.js"
RUNTIME_CHECK = ROOT / "scripts" / "check-runtime-authority-v3.js"
REVIEW_CHECK = ROOT / "scripts" / "check-review-session-v3.js"
DOCS = ROOT / "docs" / "RUNTIME_AUTHORITY_V3.md"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def replace_between(source: str, start: str, end: str, replacement: str, label: str) -> str:
    a = source.find(start)
    if a < 0:
        raise RuntimeError(f"{label}: start marker not found")
    if source.find(start, a + len(start)) >= 0:
        raise RuntimeError(f"{label}: start marker is not unique")
    b = source.find(end, a + len(start))
    if b < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return source[:a] + replacement + source[b:]


app = APP.read_text(encoding="utf-8")
app = replace_once(
    app,
    '''    study: null,
    reviewQueue: [],
    reviewIndex: 0,
    librarySearch: "",''',
    '''    study: null,
    librarySearch: "",''',
    "remove legacy Review queue state",
)

app = replace_between(
    app,
    '''  function dueCards(){''',
    '''  function cardMini(c){''',
    '''  function currentDailyPlan(){
    const plan=state.data.dailyPlan;
    if(plan?.frozen===true&&plan.date===todayKey())return plan;
    const core=window.LexiFlowLearningCore;
    return typeof core?.buildDailyPlan==="function"?core.buildDailyPlan(state.data,new Date()):null;
  }

  function planCards(key){
    const plan=currentDailyPlan();
    if(!plan||!Array.isArray(plan[key]))return [];
    const byId=new Map(state.data.cards.map(card=>[card.id,card]));
    return plan[key].map(id=>byId.get(id)).filter(Boolean);
  }

  function todayActivities(){
    const key=todayKey();
    return state.data.activities.filter(a=>todayKey(new Date(a.at))===key);
  }

  function uniqueLearnedToday(){
    return new Set(todayActivities().filter(a=>["stage-complete","review"].includes(a.type)).map(a=>a.cardId)).size;
  }

  function stableCount(){
    return state.data.cards.filter(card=>card.memoryState==="stable").length;
  }

  function progressPercent(){
    const plan=currentDailyPlan();
    const goal=Number(plan?.selectGoal||state.data.settings.dailyGoal||3);
    return Math.min(100,Math.round((uniqueLearnedToday()/Math.max(1,goal))*100));
  }

  function homePage(){
    const plan=currentDailyPlan();
    const review=Array.isArray(plan?.review)?plan.review.length:0;
    const learning=["memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);
    const cards=state.data.cards.length;
    const today=uniqueLearnedToday();
    const goal=Number(plan?.selectGoal||state.data.settings.dailyGoal||3);
    const stable=stableCount();
    const inbox=Array.isArray(plan?.inbox)?plan.inbox.length:state.data.cards.filter(card=>card.inboxPending).length;
    const primary=review
      ? `<button class="btn primary" data-action="start-review">开始复习</button>`
      : learning
        ? `<button class="btn primary" data-action="continue-learning">继续学习</button>`
        : inbox&&Number(plan?.remainingSelectSlots||0)>0
          ? `<button class="btn primary" data-route="add">继续收集单词</button>`
          : cards===0
            ? `<button class="btn primary" data-route="add">添加第一个单词</button>`
            : `<button class="btn primary" disabled>今天的计划已完成</button>`;
    return shell(
      header("","今日学习","",`<button class="btn" data-route="add">＋ 添加单词</button>`)
      + `<div class="grid cols-4">
        <div class="card stat"><div class="stat-label">今日完成</div><div class="stat-value">${today}<span style="font-size:14px;color:var(--muted)"> / ${goal}</span></div><div class="stat-hint">今日推进记录</div></div>
        <div class="card stat"><div class="stat-label">待复习</div><div class="stat-value">${review}</div><div class="stat-hint">Today Plan 已安排</div></div>
        <div class="card stat"><div class="stat-label">学习中</div><div class="stat-value">${learning}</div><div class="stat-hint">今天可推进的学习任务</div></div>
        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stable}</div><div class="stat-hint">已进入长期维护复习</div></div>
      </div>
      <div class="section card today-card">
        <div>
          <div class="eyebrow">今日进度</div>
          <h2>${cards===0?"从一个单词开始":review?"先完成今天的复习":learning?"继续今天的学习":"今天的计划已完成"}</h2>
          <p>${cards===0?"先收集一个真正想学会并会用的词。":review?`Today Plan 安排了 ${review} 个复习词，完成后再进入新学习。`:learning?`今天还有 ${learning} 个学习任务，按 Memorize → Visualize → Apply → Select 推进。`:"没有补昨天任务，也不会制造词汇债；明天会按当前状态重新生成计划。"}</p>
          <div style="margin-top:16px"><div class="progress-track"><div class="progress-bar" style="width:${progressPercent()}%"></div></div><div class="stat-hint" style="margin-top:7px">今日推进 ${today}/${goal}</div></div>
        </div>
        <div class="today-actions">${primary}<button class="btn" data-route="library">查看单词库</button></div>
      </div>
      <div class="section">
        <div class="section-title"><div><h2>最近单词</h2><p>最近添加或学习的内容。</p></div></div>
        ${cards?`<div class="grid cols-3">${state.data.cards.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6).map(cardMini).join("")}</div>`
        : `<div class="card empty"><div class="empty-icon">＋</div><strong>还没有单词</strong><span>去“选词制卡”添加你的第一个学习词。</span></div>`}
      </div>`
    );
  }

''',
    "replace legacy home scheduling helpers",
)

app = replace_once(
    app,
    '''    if(stage==="apply") return stageApply(card);
    if(stage==="review" && card.initialReviewPending) return stageInitialReview(card);
    return `<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;''',
    '''    if(stage==="apply") return stageApply(card);
    return `<div class="study-center"><strong class="prompt-big">当前学习阶段不可在这里打开</strong><p class="prompt-small">Review 由 Today Plan 的独立复习会话处理。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;''',
    "retire embedded initial Review renderer",
)

app = replace_between(
    app,
    '''  function stageInitialReview(card){''',
    '''  function localFeedback(text,word){''',
    '''  function localFeedback(text,word){''',
    "remove legacy initial Review stage UI",
)

app = replace_between(
    app,
    '''  function enterInitialReview(card){''',
    '''  function libraryPage(){''',
    '''  function reviewPage(){
    const plan=currentDailyPlan();
    const due=planCards("review");
    const stable=stableCount();
    const reviewMode=String(plan?.reviewMode||"intelligent");
    const modeLabel=reviewMode==="all"?"全部到期":reviewMode==="custom"?`自定义上限 ${plan?.reviewCap||""}`:"智能安排";
    return shell(
      header("LEXIFLOW · REVIEW","复习中心","只处理 Today Plan 已冻结的 Review 队列。",due.length?`<button class="btn primary" data-action="start-review">开始复习 (${due.length})</button>`:"")
      + `<div class="grid cols-3">
        <div class="card stat"><div class="stat-label">今日复习</div><div class="stat-value">${due.length}</div><div class="stat-hint">Today Plan 已安排</div></div>
        <div class="card stat"><div class="stat-label">累计复习</div><div class="stat-value">${state.data.activities.filter(a=>a.type==="review").length}</div><div class="stat-hint">所有主动回忆记录</div></div>
        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stable}</div><div class="stat-hint">${escapeHtml(modeLabel)}</div></div>
      </div>
      <div class="section card pad">${due.length?`<div class="table-wrap"><table class="table"><thead><tr><th>单词</th><th>中文释义</th><th>复习次数</th><th>计划日期</th></tr></thead><tbody>${due.map(c=>`<tr><td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic))}</div></td><td>${escapeHtml(c.meaningZh)}</td><td>${c.reviewCount||0}</td><td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td></tr>`).join("")}</tbody></table></div>`
      :`<div class="empty"><div class="empty-icon">✓</div><strong>今天没有安排复习</strong><span>复习只从当天冻结的 Today Plan 进入；没有补作业，也不会形成词汇债。</span></div>`}</div>`
    );
  }

  function libraryPage(){''',
    "replace legacy Review implementation with plan-only center",
)

app = replace_once(
    app,
    '''    if(state.route==="review-session"){
      const cardId=state.reviewQueue[state.reviewIndex];
      const card=cardId&&getCard(cardId);
      if(!card)return null;
      return {
        key:`review:${state.reviewIndex}:${card.id}`,
        cardId:card.id,
        order:state.reviewIndex
      };
    }
''',
    '''''',
    "remove legacy Review motion state",
)

app = replace_once(
    app,
    '''    else if(state.route==="review") html=reviewPage();
    else if(state.route==="review-session") html=reviewSessionPage();
    else if(state.route==="library") html=libraryPage();''',
    '''    else if(state.route==="review") html=reviewPage();
    else if(state.route==="library") html=libraryPage();''',
    "remove legacy Review route renderer",
)

app = replace_once(
    app,
    '''      if(state.route!=="study"&&state.route!=="review-session") state.study=null;''',
    '''      if(state.route!=="study") state.study=null;''',
    "remove legacy Review route state retention",
)

app = replace_between(
    app,
    '''    if(action==="pass-apply"){''',
    '''    if(action==="refresh-provider"){''',
    '''    if(action==="pass-apply"){
      showNotice("学习阶段没有正常保存","Apply 完成应由当前学习引擎写入明天的 Review 计划。本次不会退回旧的同日首次复习流程，请稍后重试。","warn");
      return;
    }
    if(action==="start-review"){
      if(window.LexiFlowReviewSessionV3?.open){void window.LexiFlowReviewSessionV3.open();return;}
      showNotice("复习会话还没有准备好","Today Plan 会决定本次 Review 队列。请稍后重试，不会自动退回旧复习算法。","warn");
      return;
    }
    if(action==="refresh-provider"){''',
    "retire legacy Apply-to-Review and Review action fallbacks",
)

app = replace_once(
    app,
    '''        <div class="card stat"><div class="stat-label">连续学习</div><div class="stat-value">${streak()}<span style="font-size:14px;color:var(--muted)"> 天</span></div><div class="stat-hint">按连续学习天数计算</div></div>''',
    '''        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stableCount()}</div><div class="stat-hint">已进入长期维护复习</div></div>''',
    "remove streak metric from Stats",
)
APP.write_text(app, encoding="utf-8")

review = REVIEW.read_text(encoding="utf-8")
review = replace_once(
    review,
    '''  function start(){
    injectStyle();''',
    '''  window.LexiFlowReviewSessionV3=Object.freeze({
    open(){return openSession({resume:true});},
    restart(){return openSession({resume:false});}
  });

  function start(){
    injectStyle();''',
    "expose Review Session V3 runtime bridge",
)
REVIEW.write_text(review, encoding="utf-8")

runtime_check = RUNTIME_CHECK.read_text(encoding="utf-8")
runtime_check = replace_once(
    runtime_check,
    '''assert(!reviewSession.includes("[data-action=\\\"review-rate\\\"]"),"Review Session V3 must not depend on legacy review-rate controls");''',
    '''assert(!reviewSession.includes("[data-action=\\\"review-rate\\\"]"),"Review Session V3 must not depend on legacy review-rate controls");
assert(reviewSession.includes("window.LexiFlowReviewSessionV3=Object.freeze"),"Review Session V3 must expose a narrow runtime bridge");
assert(app.includes("window.LexiFlowReviewSessionV3?.open"),"app Review entry fallback must delegate to Review Session V3");
for(const legacy of ["function startReview(","function reviewSessionPage(","function rateReview(","function stageInitialReview(","function enterInitialReview(","function finishInitialReview("]){assert(!app.includes(legacy),`legacy Review implementation must be removed from app.js: ${legacy}`);}
assert(!app.includes("reviewQueue"),"app.js must not keep a second Review queue");
assert(!app.includes("reviewIndex"),"app.js must not keep a second Review cursor");
assert(!app.includes("initial-review-rate"),"legacy initial Review controls must be removed");
assert(!app.includes("function dueCards("),"app shell must not rebuild Review membership outside DailyPlan");
assert(app.includes("function currentDailyPlan()"),"app shell must read the frozen Today Plan for fallback rendering");
assert(!app.includes("function streak("),"streak logic must stay removed from the V1 product surface");
assert(!app.includes("连续学习"),"streak copy must stay removed from app.js");''',
    "strengthen runtime Review cleanup checks",
)
RUNTIME_CHECK.write_text(runtime_check, encoding="utf-8")

review_check = REVIEW_CHECK.read_text(encoding="utf-8")
review_check = replace_once(
    review_check,
    '''const boundary=read("public/studyday-boundary-v2.js");''',
    '''const boundary=read("public/studyday-boundary-v2.js");
const app=read("public/app.js");''',
    "load app in Review V3 check",
)
review_check = replace_once(
    review_check,
    '''assert(source.includes("event.stopImmediatePropagation()"),"Review V3 must prevent app.js startReview from building a dueCards queue");''',
    '''assert(source.includes("event.stopImmediatePropagation()"),"Review V3 must own Review entry before generic app handlers run");
assert(source.includes("window.LexiFlowReviewSessionV3=Object.freeze"),"Review V3 must expose a narrow open bridge");
assert(app.includes("window.LexiFlowReviewSessionV3?.open"),"app fallback must delegate Review entry back to V3");
assert(!app.includes("function startReview("),"legacy app Review queue builder must be removed");
assert(!app.includes("function rateReview("),"legacy +3/+1 Review scheduler must be removed");
assert(!app.includes("function reviewSessionPage("),"legacy app Review session renderer must be removed");''',
    "detach Review V3 contract from legacy app Review",
)
REVIEW_CHECK.write_text(review_check, encoding="utf-8")

docs = DOCS.read_text(encoding="utf-8")
docs = replace_once(
    docs,
    '''The only active Review execution path is:

`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core -> learning-data.json`''',
    '''The only active Review execution path is:

`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core -> learning-data.json`

`app.js` no longer contains a second Review queue, Review session renderer, +3/+1 scheduler, or same-day initial Review implementation. Its Review center is display-only and reads membership from the frozen DailyPlan; the generic `start-review` fallback delegates to `LexiFlowReviewSessionV3.open()` and fails closed if V3 is unavailable.''',
    "document Review app cleanup",
)
docs = replace_once(
    docs,
    '''A change that passes syntax checks but re-loads a retired study/review script, restores no-argument `startStudy()`, or restores `activeLearningCards()[0]` as a Study entry fallback is a regression.''',
    '''A change that passes syntax checks but re-loads a retired study/review script, restores no-argument `startStudy()`, restores `activeLearningCards()[0]` as a Study entry fallback, or recreates a second Review queue/scheduler inside `app.js` is a regression.''',
    "document Review regression boundary",
)
DOCS.write_text(docs, encoding="utf-8")

print("Legacy Review cleanup V3 patch applied.")
