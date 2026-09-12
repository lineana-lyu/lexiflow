const fs = require("fs");
const path = require("path");

function assert(condition,message){ if(!condition) throw new Error(message); }
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const reviewSession=read("public/review-session-v3.js");
const reviewTransaction=read("public/review-transaction-v3.js");
const reviewTransition=read("public/review-transition-v2.js");
const studyEntry=read("public/study-entry-v3.js");
const boundary=read("public/studyday-boundary-v2.js");

function before(a,b){
  const ai=index.indexOf(a),bi=index.indexOf(b);
  assert(ai>=0,`${a} missing from index.html`);
  assert(bi>=0,`${b} missing from index.html`);
  assert(ai<bi,`${a} must load before ${b}`);
}

before("review-transition-v2.js","app.js");
before("app.js","study-entry-v3.js");
before("study-entry-v3.js","review-transaction-v3.js");
before("review-transaction-v3.js","review-session-v3.js");
assert(!index.includes('<script src="./review-v2.js"></script>'),"legacy Review V2 UI must be retired from the runtime load chain");
assert(!index.includes('<script src="./review-session-state-v2.js"></script>'),"legacy Review V2 session state must be retired from the runtime load chain");

assert(reviewSession.includes('reviewAuthority:"v3"'),"Review Session V3 must mark authoritative writes");
assert(reviewSession.includes("core.reviewSchedulePatch"),"Review Session V3 must delegate scheduling to Learning Core");
assert(reviewSession.includes("plannedQueue()"),"Review Session V3 must derive its queue from DailyPlan.review");
assert(reviewSession.includes("repairTail"),"Review Session V3 must own the same-day repair tail");
assert(reviewSession.includes('data-r3="rate"'),"Review Session V3 must own rating actions rather than legacy review-rate buttons");
assert(reviewSession.includes("baselineReviewCount" )===false,"Review Session V3 should leave crash transaction reconciliation to the transaction layer");

assert(reviewTransaction.includes("pendingCommit"),"Review transaction layer must persist an in-flight commit marker");
assert(reviewTransaction.includes("storageConfirms"),"Review transaction layer must verify persistence before cursor recovery");
assert(reviewTransaction.includes('authority==="review-session-v3"'),"Review transaction recovery must verify the V3 Review activity authority");
assert(reviewTransaction.includes("expectedReviewCount"),"Review transaction recovery must be reviewCount-idempotent");

assert(reviewTransition.includes('body?.reviewAuthority==="v3"'),"legacy transition shim must bypass V3-authored Review writes");
assert(reviewTransition.includes("core.reviewSchedulePatch"),"legacy fallback transition must still use Learning Core if reached");
assert(!reviewTransition.includes('quality==="good"?3:1'),"legacy +3/+1 scheduler must not return");

assert(studyEntry.includes("firstPlanLearningId"),"Study entry must choose from the frozen Today Plan");
assert(studyEntry.includes("legacyFirstActiveId"),"Study entry must verify the old renderer points at the planned card before allowing entry");
assert(studyEntry.includes("event.stopImmediatePropagation()"),"Study entry mismatch must fail closed instead of opening the wrong card");

assert(boundary.includes('const REVIEW_SESSION_V3_KEY="lexiflow-review-session-v3"'),"StudyDay boundary must know the V3 Review session key");
assert(boundary.includes("purgeSingle(REVIEW_SESSION_V3_KEY"),"StudyDay boundary must expire stale V3 Review sessions");
assert(boundary.includes('const REVIEW_SESSION_KEY="lexiflow-review-session-state-v2"'),"StudyDay boundary should temporarily clean legacy V2 session residue during migration");

console.log("Runtime Authority V3 checks passed.");
