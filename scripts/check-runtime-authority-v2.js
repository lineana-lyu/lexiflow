const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition,message){ if(!condition) throw new Error(message); }
function eq(actual,expected,message){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a!==e) throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
}
function roundTrip(value){ return JSON.parse(JSON.stringify(value)); }
function date(y,m,d,h=12){ return new Date(y,m-1,d,h,0,0,0); }
function diffDays(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const coreSource=read("public/learning-core-v2.js");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(coreSource,sandbox,{filename:"learning-core-v2.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

const index=read("public/index.html");
function before(a,b){
  const ai=index.indexOf(a), bi=index.indexOf(b);
  assert(ai>=0,`${a} missing from index.html`);
  assert(bi>=0,`${b} missing from index.html`);
  assert(ai<bi,`${a} must load before ${b}`);
}
before("learning-core-v2.js","studyday-boundary-v2.js");
before("studyday-boundary-v2.js","app.js");
before("learning-core-v2.js","stage-transition-v2.js");
before("stage-transition-v2.js","app.js");
before("review-transition-v2.js","app.js");
before("learning-engine-v2.js","app.js");
before("today-plan-v2.js","app.js");
before("daily-plan-persistence-v2.js","app.js");

const reviewTransition=read("public/review-transition-v2.js");
assert(reviewTransition.includes("core.reviewSchedulePatch"),"Review transition must delegate interval logic to Learning Core");
assert(reviewTransition.includes('type:"review"'),"Review transition must persist a review activity");
assert(reviewTransition.includes("event.stopPropagation()"),"Review transition must prevent legacy target handlers from owning Review mutations");
assert(!reviewTransition.includes('quality==="good"?3:1'),"Review transition must not reintroduce the legacy fixed +3/+1 scheduler");

const stageTransition=read("public/stage-transition-v2.js");
assert(stageTransition.includes("core.crossDayPatch"),"Stage transition must delegate cross-day gates to Learning Core");
assert(stageTransition.includes('card.initialReviewPending = false'),"Apply completion must retire legacy same-day initial Review");

const memorize=read("public/memorize-v2.js");
const visualize=read("public/visualize-v2.js");
const reviewUi=read("public/review-v2.js");
const engine=read("public/learning-engine-v2.js");
const boundary=read("public/studyday-boundary-v2.js");
assert(memorize.includes("core.crossDayPatch"),"Memorize completion must use the central cross-day gate");
assert(!memorize.includes("tomorrowIso"),"Memorize must not own a duplicate next-day scheduler");
assert(visualize.includes("core.crossDayPatch"),"Visualize skip must use the central cross-day gate");
assert(!visualize.includes("tomorrowIso"),"Visualize must not own a duplicate next-day scheduler");
assert(!reviewUi.includes("window.fetch="),"Review UI must not maintain a separate learning-data fetch mutation layer");
assert(reviewUi.includes("stored.date===today()"),"Review attempt UI state must be scoped to one StudyDay");
assert(!engine.includes("scheduleReload"),"Learning Engine must not duplicate stage modules' reload orchestration");
assert(boundary.includes("lexiflow-memorize-v2"),"StudyDay boundary must expire Memorize task UI state");
assert(boundary.includes("lexiflow-study-active-v2"),"StudyDay boundary must expire active study resume state");
assert(boundary.includes("lexiflow-review-resume-v2"),"StudyDay boundary must expire Review attempt UI state");
assert(boundary.includes("lexiflow-review-session-state-v2"),"StudyDay boundary must expire Review session cursor state");
assert(boundary.includes("location.reload()"),"an app left open across midnight must rebuild the new StudyDay");
assert(!boundary.includes("lexiflow-study-drafts-v2"),"cross-day boundary must not erase user Visualize/Apply drafts");

// Full first-learning path survives persistence/restart boundaries without opening the
// next stage on the same day.
const d1=date(2026,9,1), d2=date(2026,9,2), d3=date(2026,9,3), d4=date(2026,9,4), d5=date(2026,9,5);
let card={id:"word",stage:"select",inboxPending:false,todaySelectedOn:"2026-09-01",createdAt:d1.toISOString()};
Object.assign(card,core.crossDayPatch({stage:"select"},{stage:"memorize1"},d1));
card.stage="memorize1";
card=roundTrip(card);
assert(core.eligibleToday(card,d1)===false,"Select completion must not open Memorize on the same day after restart");
assert(core.eligibleToday(card,d2)===true,"Memorize must open on the next learning day");

Object.assign(card,core.crossDayPatch({stage:"memorize2"},{stage:"visualize"},d2));
card.stage="visualize"; card=roundTrip(card);
assert(core.eligibleToday(card,d2)===false,"Memorize completion must not open Visualize on the same day");
assert(core.eligibleToday(card,d3)===true,"Visualize must open next day after restart");

Object.assign(card,core.crossDayPatch({stage:"visualize"},{stage:"apply"},d3));
card.stage="apply"; card=roundTrip(card);
assert(core.eligibleToday(card,d3)===false,"Visualize completion must not open Apply on the same day");
assert(core.eligibleToday(card,d4)===true,"Apply must open next day after restart");

Object.assign(card,core.crossDayPatch({stage:"apply"},{stage:"review"},d4));
card.stage="review"; card=roundTrip(card);
assert(card.initialReviewPending===false,"Apply must never produce the old same-day initial Review state");
assert(diffDays(d4,card.nextReviewAt)===1,"first active Review must be scheduled +1 day after Apply");
assert(core.isDue(card,d4)===false,"first Review must not be due on Apply day");
assert(core.isDue(card,d5)===true,"first Review must be due next day after restart");

// A failed normal recall -> same-day repair -> mandatory next-day validation must
// survive serialization without accidentally graduating the interval.
const fail=core.reviewSchedulePatch({...card,memoryState:"reinforcing",reviewStep:2},"again",d5);
let failed=roundTrip({...card,...fail,memoryState:fail.memoryState,reviewStep:2});
assert(failed.memoryState==="review_again","failed recall must enter Review Again");
assert(core.isDue(failed,d5)===true,"first failure must remain eligible for one same-day repair");

const repaired=core.reviewSchedulePatch(failed,"good",d5);
failed=roundTrip({...failed,...repaired});
assert(failed.memoryState==="review_again","same-day repair success must not graduate Review Again");
assert(diffDays(d5,failed.nextReviewAt)===1,"same-day repair must require next-day validation");

const d6=date(2026,9,6);
const validated=core.reviewSchedulePatch(failed,"good",d6);
const recovered=roundTrip({...failed,...validated});
assert(recovered.memoryState==="reinforcing","next-day validation may return the item to reinforcing");
assert(recovered.reviewStep===1,"recovery must step back from failed step 2 to step 1");
assert(diffDays(d6,recovered.nextReviewAt)===3,"recovered step 1 must use the +3d interval");

// Frozen StudyDay membership/order survives a JSON persistence cycle. Completing a
// planned item may remove it, but newly-due work must not be appended silently.
const morning=date(2026,9,10,9);
let data=core.normalizeData({settings:{dailyGoal:3},cards:[
  {id:"r1",stage:"review",memoryState:"reinforcing",reviewStep:0,nextReviewAt:date(2026,9,10,8).toISOString(),createdAt:date(2026,8,1).toISOString()},
  {id:"m1",stage:"memorize1",stageEligibleOn:morning.toISOString(),inboxPending:false,createdAt:date(2026,8,2).toISOString()},
]},morning);
const frozenPlan=roundTrip(data.dailyPlan);
eq(frozenPlan.review,["r1"],"morning Review membership should freeze");
eq(frozenPlan.memorize,["m1"],"morning Memorize membership should freeze");

const evening=date(2026,9,10,18);
data=core.normalizeData(roundTrip({
  ...data,
  dailyPlan:frozenPlan,
  cards:[
    ...data.cards,
    {id:"late",stage:"review",memoryState:"reinforcing",reviewStep:0,nextReviewAt:date(2026,9,10,17).toISOString(),createdAt:date(2026,8,3).toISOString()},
  ],
}),evening);
eq(data.dailyPlan.review,["r1"],"restart later the same day must not append newly-due Review work");
eq(data.dailyPlan.memorize,["m1"],"restart later the same day must preserve frozen learning order");

console.log("Runtime authority and restart regression checks passed.");
