const fs = require("fs");
const path = require("path");

function assert(condition,message){ if(!condition) throw new Error(message); }
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const reviewSession=read("public/review-session-v3.js");
const reviewTransaction=read("public/review-transaction-v3.js");
const studySession=read("public/study-session-v3.js");
const studyResume=read("public/study-resume-v2.js");
const boundary=read("public/studyday-boundary-v2.js");
const stageTransition=read("public/stage-transition-v2.js");

function before(a,b){
  const ai=index.indexOf(a),bi=index.indexOf(b);
  assert(ai>=0,`${a} missing from index.html`);
  assert(bi>=0,`${b} missing from index.html`);
  assert(ai<bi,`${a} must load before ${b}`);
}

before("stage-transition-v2.js","app.js");
before("app.js","study-session-v3.js");
before("study-session-v3.js","review-transaction-v3.js");
before("review-transaction-v3.js","review-session-v3.js");
assert(!index.includes('<script src="./study-entry-v3.js"></script>'),"legacy Study Entry V3 guard must be retired from the runtime load chain");
assert(!index.includes('<script src="./review-transition-v2.js"></script>'),"legacy Review transition shim must be retired from the runtime load chain");
assert(!index.includes('<script src="./review-v2.js"></script>'),"legacy Review V2 UI must be retired from the runtime load chain");
assert(!index.includes('<script src="./review-session-state-v2.js"></script>'),"legacy Review V2 session state must be retired from the runtime load chain");

assert(reviewSession.includes('reviewAuthority:"v3"'),"Review Session V3 must mark authoritative writes");
assert(reviewSession.includes("core.reviewSchedulePatch"),"Review Session V3 must delegate scheduling to Learning Core");
assert(reviewSession.includes("plannedQueue()"),"Review Session V3 must derive its queue from DailyPlan.review");
assert(reviewSession.includes("repairTail"),"Review Session V3 must own the same-day repair tail");
assert(reviewSession.includes('data-r3="rate"'),"Review Session V3 must own rating actions rather than legacy review-rate buttons");
assert(!reviewSession.includes("[data-action=\"review-rate\"]"),"Review Session V3 must not depend on legacy review-rate controls");

assert(reviewTransaction.includes("pendingCommit"),"Review transaction layer must persist an in-flight commit marker");
assert(reviewTransaction.includes("storageConfirms"),"Review transaction layer must verify persistence before cursor recovery");
assert(reviewTransaction.includes('authority==="review-session-v3"'),"Review transaction recovery must verify the V3 Review activity authority");
assert(reviewTransaction.includes("expectedReviewCount"),"Review transaction recovery must be reviewCount-idempotent");

assert(stageTransition.includes("core.crossDayPatch"),"learning stage transitions must use Learning Core");
assert(stageTransition.includes('button.matches(\'[data-action="pass-apply"]\')'),"Apply completion must be intercepted before legacy same-day Review logic");
assert(stageTransition.includes("card.initialReviewPending=false"),"Apply completion must retire legacy same-day initial Review");

assert(studySession.includes("plannedLearningIds"),"Study Session V3 must build learning work from the frozen Today Plan");
assert(studySession.includes("legacyFirstActiveId"),"Study Session V3 must fail closed while the old renderer is still transitional");
assert(studySession.includes("event.stopImmediatePropagation()"),"Study Session V3 must intercept the old continue-learning authority");
assert(studySession.includes("pauseSession"),"Study Session V3 must own user pause semantics");
assert(studySession.includes("maybeResume"),"Study Session V3 must own same-day crash/reload resume");
assert(!studySession.includes("activeLearningCards()[0]"),"Study Session V3 must not select work through the old active-learning queue");
assert(!studyResume.includes("resumeIfNeeded"),"draft recovery must not compete with Study Session V3 for auto-resume");
assert(!studyResume.includes("setActive("),"draft recovery must not persist a second active-study authority");

assert(boundary.includes('const STUDY_SESSION_V3_KEY="lexiflow-study-session-v3"'),"StudyDay boundary must know the Study Session V3 key");
assert(boundary.includes("purgeSingle(STUDY_SESSION_V3_KEY"),"StudyDay boundary must expire stale Study Session V3 state");
assert(boundary.includes('const REVIEW_SESSION_V3_KEY="lexiflow-review-session-v3"'),"StudyDay boundary must know the V3 Review session key");
assert(boundary.includes("purgeSingle(REVIEW_SESSION_V3_KEY"),"StudyDay boundary must expire stale V3 Review sessions");
assert(boundary.includes('const REVIEW_SESSION_KEY="lexiflow-review-session-state-v2"'),"StudyDay boundary should temporarily clean legacy V2 Review session residue during migration");
assert(boundary.includes('const REVIEW_ATTEMPT_KEY="lexiflow-review-resume-v2"'),"StudyDay boundary should temporarily clean legacy V2 Review attempt residue during migration");

console.log("Runtime Authority V3 checks passed.");
