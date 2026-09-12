const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const appPath=path.join(root,"public","app.js");
const reviewPath=path.join(root,"public","review-session-v3.js");
const runtimeCheckPath=path.join(root,"scripts","check-runtime-authority-v3.js");
const reviewCheckPath=path.join(root,"scripts","check-review-session-v3.js");
const docsPath=path.join(root,"docs","RUNTIME_AUTHORITY_V3.md");

function replaceOnce(source,from,to,label){
  const first=source.indexOf(from);
  if(first<0)throw new Error(`${label}: source fragment not found`);
  if(source.indexOf(from,first+from.length)>=0)throw new Error(`${label}: source fragment is not unique`);
  return source.slice(0,first)+to+source.slice(first+from.length);
}

function replaceBetween(source,start,end,replacement,label){
  const a=source.indexOf(start);
  if(a<0)throw new Error(`${label}: start marker not found`);
  const b=source.indexOf(end,a+start.length);
  if(b<0)throw new Error(`${label}: end marker not found`);
  if(source.indexOf(start,a+start.length)>=0)throw new Error(`${label}: start marker is not unique`);
  return source.slice(0,a)+replacement+source.slice(b);
}

let app=fs.readFileSync(appPath,"utf8");
app=replaceOnce(app,
`    study: null,\n    reviewQueue: [],\n    reviewIndex: 0,\n    librarySearch: "",`,
`    study: null,\n    librarySearch: "",`,
"remove legacy Review queue state");

app=replaceBetween(app,
`  function dueCards(){`,
`  function cardMini(c){`,
`  function currentDailyPlan(){\n    const plan=state.data.dailyPlan;\n    if(plan?.frozen===true&&plan.date===todayKey())return plan;\n    const core=window.LexiFlowLearningCore;\n    return typeof core?.buildDailyPlan==="function"?core.buildDailyPlan(state.data,new Date()):null;\n  }\n\n  function planCards(key){\n    const plan=currentDailyPlan();\n    if(!plan||!Array.isArray(plan[key]))return [];\n    const byId=new Map(state.data.cards.map(card=>[card.id,card]));\n    return plan[key].map(id=>byId.get(id)).filter(Boolean);\n  }\n\n  function todayActivities(){\n    const key=todayKey();\n    return state.data.activities.filter(a=>todayKey(new Date(a.at))===key);\n  }\n\n  function uniqueLearnedToday(){\n    return new Set(todayActivities().filter(a=>["stage-complete","review"].includes(a.type)).map(a=>a.cardId)).size;\n  }\n\n  function stableCount(){\n    return state.data.cards.filter(card=>card.memoryState==="stable").length;\n  }\n\n  function progressPercent(){\n    const plan=currentDailyPlan();\n    const goal=Number(plan?.selectGoal||state.data.settings.dailyGoal||3);\n    return Math.min(100,Math.round((uniqueLearnedToday()/Math.max(1,goal))*100));\n  }\n\n  function homePage(){\n    const plan=currentDailyPlan();\n    const review=Array.isArray(plan?.review)?plan.review.length:0;\n    const learning=["memorize","visualize","apply","select"].reduce((sum,key)=>sum+(Array.isArray(plan?.[key])?plan[key].length:0),0);\n    const cards=state.data.cards.length;\n    const today=uniqueLearnedToday();\n    const goal=Number(plan?.selectGoal||state.data.settings.dailyGoal||3);\n    const stable=stableCount();\n    const inbox=Array.isArray(plan?.inbox)?plan.inbox.length:state.data.cards.filter(card=>card.inboxPending).length;\n    const primary=review\n      ? `<button class="btn primary" data-action="start-review">开始复习</button>`\n      : learning\n        ? `<button class="btn primary" data-action="continue-learning">继续学习</button>`\n        : inbox&&Number(plan?.remainingSelectSlots||0)>0\n          ? `<button class="btn primary" data-route="add">继续收集单词</button>`\n          : cards===0\n            ? `<button class="btn primary" data-route="add">添加第一个单词</button>`\n            : `<button class="btn primary" disabled>今天的计划已完成</button>`;\n    return shell(\n      header("","今日学习","",`<button class="btn" data-route="add">＋ 添加单词</button>`)\n      + `<div class="grid cols-4">\n        <div class="card stat"><div class="stat-label">今日完成</div><div class="stat-value">${today}<span style="font-size:14px;color:var(--muted)"> / ${goal}</span></div><div class="stat-hint">今日推进记录</div></div>\n        <div class="card stat"><div class="stat-label">待复习</div><div class="stat-value">${review}</div><div class="stat-hint">Today Plan 已安排</div></div>\n        <div class="card stat"><div class="stat-label">学习中</div><div class="stat-value">${learning}</div><div class="stat-hint">今天可推进的学习任务</div></div>\n        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stable}</div><div class="stat-hint">已进入长期维护复习</div></div>\n      </div>\n      <div class="section card today-card">\n        <div>\n          <div class="eyebrow">今日进度</div>\n          <h2>${cards===0?"从一个单词开始":review?"先完成今天的复习":learning?"继续今天的学习":"今天的计划已完成"}</h2>\n          <p>${cards===0?"先收集一个真正想学会并会用的词。":review?`Today Plan 安排了 ${review} 个复习词，完成后再进入新学习。`:learning?`今天还有 ${learning} 个学习任务，按 Memorize → Visualize → Apply → Select 推进。`:"没有补昨天任务，也不会制造词汇债；明天会按当前状态重新生成计划。"}</p>\n          <div style="margin-top:16px"><div class="progress-track"><div class="progress-bar" style="width:${progressPercent()}%"></div></div><div class="stat-hint" style="margin-top:7px">今日推进 ${today}/${goal}</div></div>\n        </div>\n        <div class="today-actions">${primary}<button class="btn" data-route="library">查看单词库</button></div>\n      </div>\n      <div class="section">\n        <div class="section-title"><div><h2>最近单词</h2><p>最近添加或学习的内容。</p></div></div>\n        ${cards?`<div class="grid cols-3">${state.data.cards.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6).map(cardMini).join("")}</div>`\n        : `<div class="card empty"><div class="empty-icon">＋</div><strong>还没有单词</strong><span>去“选词制卡”添加你的第一个学习词。</span></div>`}\n      </div>`\n    );\n  }\n\n`,
"replace legacy home scheduling helpers");

app=replaceOnce(app,
`    if(stage==="apply") return stageApply(card);\n    if(stage==="review" && card.initialReviewPending) return stageInitialReview(card);\n    return `<div class="study-center"><strong class="prompt-big">首次学习已完成</strong><p class="prompt-small">这张卡片已经进入复习队列。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;`,
`    if(stage==="apply") return stageApply(card);\n    return `<div class="study-center"><strong class="prompt-big">当前学习阶段不可在这里打开</strong><p class="prompt-small">Review 由 Today Plan 的独立复习会话处理。</p><button class="btn primary" data-route="home">返回今日学习</button></div>`;`,
"retire embedded initial Review renderer");

app=replaceBetween(app,
`  function stageInitialReview(card){`,
`  function localFeedback(text,word){`,
`  function localFeedback(text,word){`,
"remove legacy initial Review stage UI");

app=replaceBetween(app,
`  function enterInitialReview(card){`,
`  function libraryPage(){`,
`  function reviewPage(){\n    const plan=currentDailyPlan();\n    const due=planCards("review");\n    const stable=stableCount();\n    const reviewMode=String(plan?.reviewMode||"intelligent");\n    const modeLabel=reviewMode==="all"?"全部到期":reviewMode==="custom"?`自定义上限 ${plan?.reviewCap||""}`:"智能安排";\n    return shell(\n      header("LEXIFLOW · REVIEW","复习中心","只处理 Today Plan 已冻结的 Review 队列。",due.length?`<button class="btn primary" data-action="start-review">开始复习 (${due.length})</button>`:"")\n      + `<div class="grid cols-3">\n        <div class="card stat"><div class="stat-label">今日复习</div><div class="stat-value">${due.length}</div><div class="stat-hint">Today Plan 已安排</div></div>\n        <div class="card stat"><div class="stat-label">累计复习</div><div class="stat-value">${state.data.activities.filter(a=>a.type==="review").length}</div><div class="stat-hint">所有主动回忆记录</div></div>\n        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stable}</div><div class="stat-hint">${escapeHtml(modeLabel)}</div></div>\n      </div>\n      <div class="section card pad">${due.length?`<div class="table-wrap"><table class="table"><thead><tr><th>单词</th><th>中文释义</th><th>复习次数</th><th>计划日期</th></tr></thead><tbody>${due.map(c=>`<tr><td><strong>${escapeHtml(c.word)}</strong><div class="phonetic">${escapeHtml(formatPhonetic(c.phonetic))}</div></td><td>${escapeHtml(c.meaningZh)}</td><td>${c.reviewCount||0}</td><td>${c.nextReviewAt?new Date(c.nextReviewAt).toLocaleDateString():"—"}</td></tr>`).join("")}</tbody></table></div>`\n      :`<div class="empty"><div class="empty-icon">✓</div><strong>今天没有安排复习</strong><span>复习只从当天冻结的 Today Plan 进入；没有补作业，也不会形成词汇债。</span></div>`}</div>`\n    );\n  }\n\n  function libraryPage(){`,
"replace legacy Review implementation with plan-only center");

app=replaceOnce(app,
`    if(state.route==="review-session"){\n      const cardId=state.reviewQueue[state.reviewIndex];\n      const card=cardId&&getCard(cardId);\n      if(!card)return null;\n      return {\n        key:\`review:${state.reviewIndex}:${card.id}\`,\n        cardId:card.id,\n        order:state.reviewIndex\n      };\n    }\n`,
``,
"remove legacy Review motion state");

app=replaceOnce(app,
`    else if(state.route==="review") html=reviewPage();\n    else if(state.route==="review-session") html=reviewSessionPage();\n    else if(state.route==="library") html=libraryPage();`,
`    else if(state.route==="review") html=reviewPage();\n    else if(state.route==="library") html=libraryPage();`,
"remove legacy Review route renderer");

app=replaceOnce(app,
`      if(state.route!=="study"&&state.route!=="review-session") state.study=null;`,
`      if(state.route!=="study") state.study=null;`,
"remove legacy Review route state retention");

app=replaceBetween(app,
`    if(action==="pass-apply"){`,
`    if(action==="refresh-provider"){`,
`    if(action==="pass-apply"){\n      showNotice("学习阶段没有正常保存","Apply 完成应由当前学习引擎写入明天的 Review 计划。本次不会退回旧的同日首次复习流程，请稍后重试。","warn");\n      return;\n    }\n    if(action==="start-review"){\n      if(window.LexiFlowReviewSessionV3?.open){void window.LexiFlowReviewSessionV3.open();return;}\n      showNotice("复习会话还没有准备好","Today Plan 会决定本次 Review 队列。请稍后重试，不会自动退回旧复习算法。","warn");\n      return;\n    }\n    if(action==="refresh-provider"){`,
"retire legacy Apply-to-Review and Review action fallbacks");

app=replaceOnce(app,
`        <div class="card stat"><div class="stat-label">连续学习</div><div class="stat-value">${streak()}<span style="font-size:14px;color:var(--muted)"> 天</span></div><div class="stat-hint">按连续学习天数计算</div></div>`,
`        <div class="card stat"><div class="stat-label">长期稳定</div><div class="stat-value">${stableCount()}</div><div class="stat-hint">已进入长期维护复习</div></div>`,
"remove streak metric from Stats");

fs.writeFileSync(appPath,app,"utf8");

let review=fs.readFileSync(reviewPath,"utf8");
review=replaceOnce(review,
`  function start(){\n    injectStyle();`,
`  window.LexiFlowReviewSessionV3=Object.freeze({\n    open(){return openSession({resume:true});},\n    restart(){return openSession({resume:false});}\n  });\n\n  function start(){\n    injectStyle();`,
"expose Review Session V3 runtime bridge");
fs.writeFileSync(reviewPath,review,"utf8");

let runtimeCheck=fs.readFileSync(runtimeCheckPath,"utf8");
runtimeCheck=replaceOnce(runtimeCheck,
`assert(!reviewSession.includes("[data-action=\\\"review-rate\\\"]"),"Review Session V3 must not depend on legacy review-rate controls");`,
`assert(!reviewSession.includes("[data-action=\\\"review-rate\\\"]"),"Review Session V3 must not depend on legacy review-rate controls");\nassert(reviewSession.includes("window.LexiFlowReviewSessionV3=Object.freeze"),"Review Session V3 must expose a narrow runtime bridge");\nassert(app.includes("window.LexiFlowReviewSessionV3?.open"),"app Review entry fallback must delegate to Review Session V3");\nfor(const legacy of ["function startReview(","function reviewSessionPage(","function rateReview(","function stageInitialReview(","function enterInitialReview(","function finishInitialReview("]){assert(!app.includes(legacy),`legacy Review implementation must be removed from app.js: ${legacy}`);}\nassert(!app.includes("reviewQueue"),"app.js must not keep a second Review queue");\nassert(!app.includes("reviewIndex"),"app.js must not keep a second Review cursor");\nassert(!app.includes("initial-review-rate"),"legacy initial Review controls must be removed");\nassert(!app.includes("function dueCards("),"app shell must not rebuild Review membership outside DailyPlan");\nassert(app.includes("function currentDailyPlan()"),"app shell must read the frozen Today Plan for fallback rendering");\nassert(!app.includes("function streak("),"streak logic must stay removed from the V1 product surface");\nassert(!app.includes("连续学习"),"streak copy must stay removed from app.js");`,
"strengthen runtime Review cleanup checks");
fs.writeFileSync(runtimeCheckPath,runtimeCheck,"utf8");

let reviewCheck=fs.readFileSync(reviewCheckPath,"utf8");
reviewCheck=replaceOnce(reviewCheck,
`const boundary=read("public/studyday-boundary-v2.js");`,
`const boundary=read("public/studyday-boundary-v2.js");\nconst app=read("public/app.js");`,
"load app in Review V3 check");
reviewCheck=replaceOnce(reviewCheck,
`assert(source.includes("event.stopImmediatePropagation()"),"Review V3 must prevent app.js startReview from building a dueCards queue");`,
`assert(source.includes("event.stopImmediatePropagation()"),"Review V3 must own Review entry before generic app handlers run");\nassert(source.includes("window.LexiFlowReviewSessionV3=Object.freeze"),"Review V3 must expose a narrow open bridge");\nassert(app.includes("window.LexiFlowReviewSessionV3?.open"),"app fallback must delegate Review entry back to V3");\nassert(!app.includes("function startReview("),"legacy app Review queue builder must be removed");\nassert(!app.includes("function rateReview("),"legacy +3/+1 Review scheduler must be removed");\nassert(!app.includes("function reviewSessionPage("),"legacy app Review session renderer must be removed");`,
"detach Review V3 contract from legacy app Review");
fs.writeFileSync(reviewCheckPath,reviewCheck,"utf8");

let docs=fs.readFileSync(docsPath,"utf8");
docs=replaceOnce(docs,
`The only active Review execution path is:\n\n\`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core -> learning-data.json\``,
`The only active Review execution path is:\n\n\`DailyPlan.review -> review-transaction-v3.js -> review-session-v3.js -> Learning Core -> learning-data.json\`\n\n\`app.js\` no longer contains a second Review queue, Review session renderer, +3/+1 scheduler, or same-day initial Review implementation. Its Review center is display-only and reads membership from the frozen DailyPlan; the generic \`start-review\` fallback delegates to \`LexiFlowReviewSessionV3.open()\` and fails closed if V3 is unavailable.`,
"document Review app cleanup");
docs=replaceOnce(docs,
`A change that passes syntax checks but re-loads a retired study/review script, restores no-argument \`startStudy()\`, or restores \`activeLearningCards()[0]\` as a Study entry fallback is a regression.`,
`A change that passes syntax checks but re-loads a retired study/review script, restores no-argument \`startStudy()\`, restores \`activeLearningCards()[0]\` as a Study entry fallback, or recreates a second Review queue/scheduler inside \`app.js\` is a regression.`,
"document Review regression boundary");
fs.writeFileSync(docsPath,docs,"utf8");

console.log("Legacy Review cleanup V3 patch applied.");
