const fs = require("fs");
const path = require("path");

function assert(condition,message){ if(!condition) throw new Error(message); }
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const reviewSession=read("public/review-session-v3.js");
const reviewTransaction=read("public/review-transaction-v3.js");
const reviewPolicy=read("public/review-policy-v3.js");
const planPersistence=read("public/daily-plan-persistence-v3.js");
const todayPlan=read("public/today-plan-v3.js");
const studySession=read("public/study-session-v3.js");
const studyDrafts=read("public/study-drafts-v3.js");
const studySurface=read("public/study-stage-surface-v3.js");
const visualActions=read("public/visualize-actions-v3.js");
const applyGuard=read("public/apply-guard-v3.js");
const sourceContext=read("public/source-context-v3.js");
const boundary=read("public/studyday-boundary-v3.js");
const stageTransition=read("public/stage-transition-v2.js");
const memorize=read("public/memorize-stage-v3.js");
const safety=read("public/safety-controls.js");
const app=read("public/app.js");

function before(a,b){
  const ai=index.indexOf(a),bi=index.indexOf(b);
  assert(ai>=0,`${a} missing from index.html`);
  assert(bi>=0,`${b} missing from index.html`);
  assert(ai<bi,`${a} must load before ${b}`);
}

before("learning-core-v2.js","studyday-boundary-v3.js");
before("studyday-boundary-v3.js","stage-transition-v2.js");
before("today-plan-v3.js","daily-plan-persistence-v3.js");
before("daily-plan-persistence-v3.js","source-context-v3.js");
before("stage-transition-v2.js","source-context-v3.js");
before("source-context-v3.js","app.js");
before("app.js","study-stage-surface-v3.js");
before("study-stage-surface-v3.js","study-session-v3.js");
before("study-session-v3.js","review-transaction-v3.js");
before("review-transaction-v3.js","review-session-v3.js");
before("apply-actions-v3.js","review-policy-v3.js");
before("review-policy-v3.js","visualize-actions-v3.js");
before("visualize-actions-v3.js","apply-guard-v3.js");
assert(index.includes('<script src="./memorize-stage-v3.js"></script>'),"Memorize Stage V3 must be active");
assert(index.includes('<script src="./source-context-v3.js"></script>'),"Source Context V3 must be active");
assert(index.includes('<script src="./review-policy-v3.js"></script>'),"Review Policy V3 must be active");
assert(index.includes('<script src="./apply-guard-v3.js"></script>'),"Apply Guard V3 must be active");
assert(index.includes('<script src="./daily-plan-persistence-v3.js"></script>'),"DailyPlan Persistence V3 must be active");
assert(index.includes('<script src="./studyday-boundary-v3.js"></script>'),"StudyDay Boundary V3 must be active");
assert(index.includes('<script src="./today-plan-v3.js"></script>'),"Today Plan V3 must be active");
for(const retiredScript of ["study-entry-v3.js","review-transition-v2.js","review-v2.js","review-session-state-v2.js","study-resume-v2.js","visualize-v2.js","memorize-v2.js","source-context-v2.js","review-policy-v2.js","apply-guard-v2.js","daily-plan-persistence-v2.js","studyday-boundary-v2.js","today-plan-v2.js"]){
  assert(!index.includes(`<script src="./${retiredScript}"></script>`),`${retiredScript} must be retired from runtime`);
}
for(const retired of ["public/study-entry-v3.js","public/review-transition-v2.js","public/review-v2.js","public/review-session-state-v2.js","public/study-resume-v2.js","public/visualize-v2.js","public/memorize-v2.js","public/source-context-v2.js","public/review-policy-v2.js","public/apply-guard-v2.js","public/daily-plan-persistence-v2.js","public/studyday-boundary-v2.js","public/today-plan-v2.js"]){
  assert(!exists(retired),`retired runtime source must stay deleted: ${retired}`);
}
assert(sourceContext.includes("core.canonicalStage(card)"),"Source Context V3 must use canonical stage identity");
assert(sourceContext.includes('DRAFT_KEY = "lexiflow-source-context-draft-v2"'),"Source Context V3 must preserve existing draft storage during upgrade");
assert(!sourceContext.includes("const stage=String(card.stage"),"Source Context V3 must not branch on raw legacy stage values");
assert(reviewPolicy.includes("复习与巩固"),"Review Policy V3 must expose the simplified Review & Reinforcement settings surface");
assert(!reviewPolicy.includes("复习方式")&&!reviewPolicy.includes("data-review-type"),"Review Policy V3 must not restore user-configurable question methods");
assert(applyGuard.includes("LexiFlowStudyRenderer?.currentCardId"),"Apply Guard V3 must use explicit current card identity");
assert(applyGuard.includes('core.canonicalStage(card)==="apply"'),"Apply Guard V3 must validate canonical Apply stage identity");
assert(!applyGuard.includes('document.querySelector(".apply-word-hero .target-word-text'),"Apply Guard V3 must not infer card identity from rendered word text");
assert(planPersistence.includes("LexiFlowDailyPlanPersistenceV3=Object.freeze"),"DailyPlan Persistence V3 must expose a narrow explicit bridge");
assert(planPersistence.includes('dailyPlanAuthority:"v3"'),"DailyPlan Persistence V3 must identify persisted writes");
assert(!planPersistence.includes("window.fetch="),"DailyPlan Persistence V3 must not mutate global fetch or hide writes behind GET interception");
assert(todayPlan.includes("LexiFlowTodayPlanV3=Object.freeze"),"Today Plan V3 must expose a narrow explicit bridge");
assert(todayPlan.includes('todayPlanAuthority:"v3"'),"Today Plan V3 must identify its writes");
assert(!todayPlan.includes("window.fetch =")&&!todayPlan.includes("window.fetch="),"Today Plan V3 must not mutate global fetch");
assert(todayPlan.includes("selectFromPending")&&todayPlan.includes("moveBackToPending"),"Today Plan V3 must explicitly own Pending ↔ Today selection");
assert(boundary.includes('RUNTIME_KEY="lexiflow-studyday-runtime-v3"'),"StudyDay Boundary V3 must own the current runtime-day marker");
assert(boundary.includes('LEGACY_RUNTIME_KEY="lexiflow-studyday-runtime-v2"'),"StudyDay Boundary V3 must migrate the legacy runtime-day marker");
assert(boundary.includes("localStorage.removeItem(LEGACY_RUNTIME_KEY)"),"StudyDay Boundary V3 must clean the legacy marker after migration");
assert(boundary.includes("LexiFlowStudyDayBoundaryV3=Object.freeze"),"StudyDay Boundary V3 must expose a narrow diagnostics bridge");

assert(reviewSession.includes('reviewAuthority:"v3"'),"Review Session V3 must mark authoritative writes");
assert(reviewSession.includes("core.reviewSchedulePatch"),"Review Session V3 must delegate scheduling to Learning Core");
assert(reviewSession.includes("plannedQueue()"),"Review Session V3 must derive its queue from DailyPlan.review");
assert(reviewSession.includes("repairTail"),"Review Session V3 must own the same-day repair tail");
assert(reviewSession.includes('data-r3="rate"'),"Review Session V3 must own rating actions rather than legacy review-rate buttons");
assert(!reviewSession.includes("[data-action=\"review-rate\"]"),"Review Session V3 must not depend on legacy review-rate controls");
assert(reviewSession.includes("window.LexiFlowReviewSessionV3=Object.freeze"),"Review Session V3 must expose a narrow runtime bridge");
assert(app.includes("window.LexiFlowReviewSessionV3?.open"),"app Review entry fallback must delegate to Review Session V3");
for(const legacy of ["function startReview(","function reviewSessionPage(","function rateReview(","function stageInitialReview(","function enterInitialReview(","function finishInitialReview("]){assert(!app.includes(legacy),`legacy Review implementation must be removed from app.js: ${legacy}`);}
assert(!app.includes("reviewQueue"),"app.js must not keep a second Review queue");
assert(!app.includes("reviewIndex"),"app.js must not keep a second Review cursor");
assert(!app.includes("initial-review-rate"),"legacy initial Review controls must be removed");
assert(!app.includes("function dueCards("),"app shell must not rebuild Review membership outside DailyPlan");
assert(app.includes("function currentDailyPlan()"),"app shell must read the frozen Today Plan for fallback rendering");
assert(!app.includes("function streak("),"streak logic must stay removed from the V1 product surface");
assert(!app.includes("连续学习"),"streak copy must stay removed from app.js");

assert(reviewTransaction.includes("pendingCommit"),"Review transaction layer must persist an in-flight commit marker");
assert(reviewTransaction.includes("storageConfirms"),"Review transaction layer must verify persistence before cursor recovery");
assert(reviewTransaction.includes('authority==="review-session-v3"'),"Review transaction recovery must verify the V3 Review activity authority");
assert(reviewTransaction.includes("expectedReviewCount"),"Review transaction recovery must be reviewCount-idempotent");

assert(stageTransition.includes("core.crossDayPatch"),"learning stage transitions must use Learning Core");
assert(stageTransition.includes('button.matches(\'[data-action="pass-apply"]\')'),"Apply completion must be intercepted before legacy same-day Review logic");
assert(stageTransition.includes("card.initialReviewPending=false"),"Apply completion must retire legacy same-day initial Review");
assert(stageTransition.includes("window.LexiFlowStudyRenderer?.currentCardId?.()"),"stage completion must resolve the exact Study Session card ID");
assert(!stageTransition.includes("cardForDom"),"stage completion must not infer the card by DOM word text");
assert(stageTransition.includes("resync(button)"),"failed stage identity resolution must resync instead of silently repeating the same confirmation");
assert(memorize.includes("window.LexiFlowStudyRenderer?.currentCardId?.()"),"Memorize Stage V3 must resolve the exact Study Session renderer card ID");
assert(memorize.includes('core.canonicalStage(card)==="memorize"'),"Memorize Stage V3 must own one canonical Memorize stage");
assert(!memorize.includes("chinese-memory-prompt"),"Memorize must not infer its card from legacy DOM content");
assert(!memorize.includes('[data-action=\"memory-rate\"]'),"Memorize must not depend on legacy memory-rate controls");
for(const legacy of ["function stageMem1(","function stageMem2(","function advanceStage("]){assert(!app.includes(legacy),`legacy learning-stage authority must be removed from app.js: ${legacy}`);}
assert(!app.includes('if(action===\"memory-rate\")'),"app.js must not retain legacy Memorize rating authority");
assert(!app.includes('if(action===\"reveal\")'),"app.js must not retain legacy Memorize reveal state");
assert(app.includes("data-lexi-memorize-shell"),"app.js should expose only a passive Memorize render host");

assert(studySurface.includes("data-study-stage-host-v3"),"Study Surface V3 must quarantine legacy stage bodies while authoritative renderers load");
assert(studySurface.includes("const ROOTS=Object.freeze"),"Study Surface V3 must recognize the active stage renderer roots");
assert(studySession.includes("plannedLearningIds"),"Study Session V3 must build learning work from the frozen Today Plan");
assert(studySession.includes("window.LexiFlowStudyRenderer"),"Study Session V3 must call the explicit renderer bridge");
assert(studySession.includes("view.openCard(card.id)"),"Study Session V3 must open the exact planned card ID");
assert(!studySession.includes("legacyFirstActiveId"),"Study Session V3 must not consult a legacy first-active selector");
assert(studySession.includes("event.stopImmediatePropagation()"),"Study Session V3 must intercept the old continue-learning authority");
assert(studySession.includes("pauseSession"),"Study Session V3 must own user pause semantics");
assert(studySession.includes("maybeResume"),"Study Session V3 must own same-day crash/reload resume");
assert(!studySession.includes("activeLearningCards()[0]"),"Study Session V3 must not select work through the old active-learning queue");
assert(app.includes("window.LexiFlowStudyRenderer=Object.freeze"),"app.js must expose only a narrow Study renderer bridge");
assert(!app.includes("cardId?getCard(cardId):activeLearningCards()[0]"),"app renderer must not fall back to legacy queue selection");
assert(app.includes("window.LexiFlowStudySessionV3?.open"),"legacy button handler must delegate to Study Session V3 instead of choosing work itself");
assert(!studyDrafts.includes("resumeIfNeeded"),"draft recovery must not compete with Study Session V3 for auto-resume");
assert(!studyDrafts.includes("setActive("),"draft recovery must not persist a second active-study authority");
assert(studyDrafts.includes("core.canonicalStage(card)"),"Study Drafts V3 must bind recovery to the canonical stage model");
assert(visualActions.includes('core.canonicalStage(current)==="visualize"'),"Visualize Actions V3 must use canonical stage identity");
assert(visualActions.includes('data-visual-actions-v3="skip"'),"Visualize Actions V3 must own the explicit skip action marker");

assert(boundary.includes('const STUDY_SESSION_V3_KEY="lexiflow-study-session-v3"'),"StudyDay boundary must know the Study Session V3 key");
assert(boundary.includes("purgeSingle(STUDY_SESSION_V3_KEY"),"StudyDay boundary must expire stale Study Session V3 state");
assert(boundary.includes('const REVIEW_SESSION_V3_KEY="lexiflow-review-session-v3"'),"StudyDay boundary must know the V3 Review session key");
assert(boundary.includes("purgeSingle(REVIEW_SESSION_V3_KEY"),"StudyDay boundary must expire stale V3 Review sessions");
assert(boundary.includes('const REVIEW_SESSION_KEY="lexiflow-review-session-state-v2"'),"StudyDay boundary should temporarily clean legacy V2 Review session residue during migration");
assert(boundary.includes('const REVIEW_ATTEMPT_KEY="lexiflow-review-resume-v2"'),"StudyDay boundary should temporarily clean legacy V2 Review attempt residue during migration");

assert(safety.includes("verifiedReset"),"clear-data control must own a verified reset flow");
assert(safety.includes('method:"POST"'),"clear-data flow must write an empty learning dataset to persistent storage");
assert(safety.includes("RESET_VERIFICATION_FAILED"),"clear-data flow must verify persistent storage before reporting success");
assert(safety.includes("lexiflow-study-session-v3"),"clear-data flow must remove Study Session local residue");
assert(safety.includes("lexiflow-review-session-v3"),"clear-data flow must remove Review Session local residue");
assert(!safety.includes("window.prompt"),"clear-data flow should use the visible confirmation modal rather than a fragile prompt-only action");

console.log("Runtime Authority V3 checks passed.");