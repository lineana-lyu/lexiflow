const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition,message){ if(!condition) throw new Error(message); }
function eq(actual,expected,message){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a!==e) throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
}
function date(y,m,d,h=12){ return new Date(y,m-1,d,h,0,0,0); }
function diffDays(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(read("public/learning-core-v2.js"),sandbox,{filename:"learning-core-v2.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

eq(core.REVIEW_INTERVALS,[1,3,7,16,21],"Review ladder changed unexpectedly");
eq(core.STABLE_INTERVALS,[30,45,68,90],"Stable ladder changed unexpectedly");
eq(core.TODAY_ORDER,["review","memorize","visualize","apply","select"],"Today order changed unexpectedly");
assert(core.PLAN_VERSION===3,"DailyPlan version must include frozen task-progress metadata");

const index=read("public/index.html");
const runtimeOrder=[
  "learning-core-v2.js","studyday-boundary-v2.js","stage-transition-v2.js","learning-engine-v2.js",
  "today-plan-v2.js","daily-plan-persistence-v2.js","source-context-v2.js","app.js","study-session-v3.js",
  "review-transaction-v3.js","review-session-v3.js","memorize-v2.js","study-resume-v2.js",
  "review-policy-v2.js","visualize-v2.js","apply-guard-v2.js"
];
let previous=-1;
for(const file of runtimeOrder){
  const i=index.indexOf(file);
  assert(i>=0,`${file} is not loaded by public/index.html`);
  assert(i>previous,`${file} is loaded out of order in public/index.html`);
  previous=i;
}
assert(!index.includes('<script src="./study-entry-v3.js"></script>'),"legacy Study Entry V3 must not execute beside Study Session V3");
assert(!index.includes('<script src="./review-transition-v2.js"></script>'),"legacy review-transition-v2.js must not execute in the V3 runtime");
assert(!index.includes('<script src="./review-v2.js"></script>'),"legacy review-v2.js must not execute in the V3 runtime");
assert(!index.includes('<script src="./review-session-state-v2.js"></script>'),"legacy review-session-state-v2.js must not execute in the V3 runtime");

const todayUi=read("public/today-plan-v2.js");
assert(todayUi.includes('if(!count)return ""'),"Today UI must hide zero-count task rows");
assert(todayUi.includes('class="lexi-today-progress"'),"Today progress must be integrated into the compact Today card");
assert(todayUi.includes('data-library-filter="${key}"'),"Word Library must own the pending/learning/stable filters");
assert(todayUi.includes("待学习"),"collected words must be presented as Pending inside Word Library");
assert(!todayUi.includes('id="lexi-inbox"'),"Home must not expose a separate Inbox panel");
assert(todayUi.includes("next.dailyPlan.initialTaskIds=next.dailyPlan.initialTaskIds.filter"),"moving a selected word back to Pending must remove it from the frozen progress denominator rather than count it as completed");

const d1=date(2026,9,1), d2=date(2026,9,2);
const collected=core.normalizeCard({id:"inbox",stage:"select",createdAt:d1.toISOString()},d1);
assert(collected.inboxPending===true,"newly collected cards must enter internal pending state");
const selected=core.normalizeCard({id:"picked",stage:"select",todaySelectedOn:"2026-09-01",createdAt:d1.toISOString()},d1);
assert(selected.inboxPending===false,"Today-selected cards must leave internal pending state");

const selectPatch=core.crossDayPatch({stage:"select"},{stage:"memorize1"},d1);
assert(diffDays(d1,selectPatch.stageEligibleOn)===1,"Select -> Memorize must wait until next StudyDay");
const applyPatch=core.crossDayPatch({stage:"apply"},{stage:"review"},d1);
assert(applyPatch.initialReviewPending===false,"Apply must not open same-day initial Review");
assert(diffDays(d1,applyPatch.nextReviewAt)===1,"first Review must be scheduled for next StudyDay");

let patch=core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:0},"good",d1);
assert(patch.reviewStep===1&&diffDays(d1,patch.nextReviewAt)===3,"Review step 0 success must schedule +3d");
patch=core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:4},"good",d1);
assert(patch.memoryState==="stable"&&diffDays(d1,patch.nextReviewAt)===30,"21d success must enter Stable at +30d");
patch=core.reviewSchedulePatch({memoryState:"stable",stableStep:0,reviewStep:4},"good",d1);
assert(patch.stableStep===1&&diffDays(d1,patch.nextReviewAt)===45,"Stable success must advance 30 -> 45");

const failed=core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:3},"again",d1);
assert(failed.memoryState==="review_again","failed first recall must enter Review Again");
assert(core.valueDayKey(failed.nextReviewAt)===core.dayKey(d1),"first failure must remain eligible for same-day repair");
const repaired=core.reviewSchedulePatch({...failed,reviewStep:3},"good",d1);
assert(repaired.memoryState==="review_again"&&diffDays(d1,repaired.nextReviewAt)===1,"same-day repair success must still require next-day validation");
const recovered=core.reviewSchedulePatch({...failed,reviewStep:3},"good",d2);
assert(recovered.memoryState==="reinforcing"&&recovered.reviewStep===2,"next-day validation must recover one step lower");
const validationFailed=core.reviewSchedulePatch({...failed,reviewStep:3},"again",d2);
assert(validationFailed.memoryState==="review_again","failed next-day validation must remain Review Again");
assert(diffDays(d2,validationFailed.nextReviewAt)===1,"failed next-day validation must wait until the next StudyDay, not create another same-day repair loop");

const reviewUi=read("public/review-session-v3.js");
assert(reviewUi.includes('kind==="scheduled"||kind==="stable-maintenance"'),"only a normal scheduled first-recall failure may create the one same-day repair tail");
assert(reviewUi.includes("没记住，明天再验证"),"next-day validation failure copy must not promise another same-day repair");
assert(!reviewUi.includes("settings.reviewTypes"),"Review question types must be system-owned after removing the user-facing review-method setting");
assert(!reviewUi.includes("settings.reviewTypeWeights"),"Review question weights must be system-owned after removing the user-facing review-method setting");

const morning=date(2026,9,10,8);
const noon=date(2026,9,10,12);
assert(core.isDue({stage:"review",nextReviewAt:noon.toISOString()},morning)===true,"Review due semantics must be StudyDay-based, not clock-time-based");

const data=core.normalizeData({settings:{dailyGoal:3},cards:[
  {id:"r",stage:"review",memoryState:"reinforcing",reviewStep:0,nextReviewAt:morning.toISOString(),createdAt:d1.toISOString()},
  {id:"m",stage:"memorize1",stageEligibleOn:morning.toISOString(),inboxPending:false,createdAt:d1.toISOString()},
  {id:"v",stage:"visualize",stageEligibleOn:morning.toISOString(),inboxPending:false,createdAt:d1.toISOString()},
  {id:"a",stage:"apply",stageEligibleOn:morning.toISOString(),inboxPending:false,createdAt:d1.toISOString()},
  {id:"s",stage:"select",todaySelectedOn:"2026-09-10",inboxPending:false,createdAt:d1.toISOString()},
]},morning);
assert(core.firstPlanStage(data.dailyPlan)==="review","Review must remain first in Today Plan");
eq([data.dailyPlan.review.length,data.dailyPlan.memorize.length,data.dailyPlan.visualize.length,data.dailyPlan.apply.length,data.dailyPlan.select.length],[1,1,1,1,1],"Today Plan stage buckets are incorrect");
assert(data.dailyPlan.noVocabularyDebt===true,"DailyPlan must preserve No Vocabulary Debt");
assert(data.dailyPlan.taskTotal===5&&data.dailyPlan.taskRemaining===5&&data.dailyPlan.taskCompleted===0,"new frozen plan must capture its initial task total");

const progressed=JSON.parse(JSON.stringify(data));
const reviewCard=progressed.cards.find(card=>card.id==="r");
reviewCard.nextReviewAt=core.addDaysIso(morning,1);
const progressedData=core.normalizeData(progressed,new Date(2026,8,10,18,0,0,0));
assert(progressedData.dailyPlan.taskTotal===5,"same-day progress must preserve the frozen original task total");
assert(progressedData.dailyPlan.taskRemaining===4&&progressedData.dailyPlan.taskCompleted===1,"Today progress must reflect completed frozen tasks");

console.log("Learning Engine V3 runtime contract checks passed.");