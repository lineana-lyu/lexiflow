const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition, message){
  if(!condition) throw new Error(message);
}
function eq(actual, expected, message){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a !== e) throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
}
function utcLocalDate(y,m,d,h=12){
  return new Date(y,m-1,d,h,0,0,0);
}
function dayDiff(a,b){
  const ms = new Date(b).getTime()-new Date(a).getTime();
  return Math.round(ms/86400000);
}

const root = path.join(__dirname,"..");
const corePath = path.join(root,"public","learning-core-v2.js");
const source = fs.readFileSync(corePath,"utf8");
const sandbox = {window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:"learning-core-v2.js"});
const core = sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

eq(core.REVIEW_INTERVALS,[1,3,7,16,21],"review ladder changed unexpectedly");
eq(core.STABLE_INTERVALS,[30,45,68,90],"stable ladder changed unexpectedly");
eq(core.TODAY_ORDER,["review","memorize","visualize","apply","select"],"Today order changed unexpectedly");

const indexHtml = fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const requiredOrder = ["learning-core-v2.js","learning-engine-v2.js","today-plan-v2.js","source-context-v2.js","app.js","memorize-v2.js","study-resume-v2.js","review-v2.js","visualize-v2.js","apply-guard-v2.js"];
let previousIndex = -1;
for(const file of requiredOrder){
  const index = indexHtml.indexOf(file);
  assert(index >= 0,`${file} is not loaded by public/index.html`);
  assert(index > previousIndex,`${file} is loaded out of order in public/index.html`);
  previousIndex = index;
}

const d1 = utcLocalDate(2026,9,1);
const d2 = utcLocalDate(2026,9,2);

const newInbox = core.normalizeCard({id:"a",stage:"select",createdAt:d1.toISOString()},d1);
assert(newInbox.inboxPending === true,"newly collected Select card must enter Inbox");
const picked = core.normalizeCard({id:"b",stage:"select",todaySelectedOn:"2026-09-01",createdAt:d1.toISOString()},d1);
assert(picked.inboxPending === false,"Today-selected card must leave Inbox");

const selectPatch = core.crossDayPatch({stage:"select"},{stage:"memorize1"},d1);
assert(selectPatch && selectPatch.memoryState === "learning","Select -> Memorize must create learning gate");
assert(dayDiff(d1,selectPatch.stageEligibleOn) === 1,"Memorize must open on next learning day");
const applyPatch = core.crossDayPatch({stage:"apply"},{stage:"review"},d1);
assert(dayDiff(d1,applyPatch.nextReviewAt) === 1,"first Review must be due one day after Apply");
assert(applyPatch.reviewStep === 0,"first Review must start at step 0");

let patch = core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:0},"good",d1);
assert(patch.reviewStep === 1 && dayDiff(d1,patch.nextReviewAt) === 3,"step 0 success must schedule +3d");
patch = core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:1},"good",d1);
assert(patch.reviewStep === 2 && dayDiff(d1,patch.nextReviewAt) === 7,"step 1 success must schedule +7d");
patch = core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:2},"good",d1);
assert(patch.reviewStep === 3 && dayDiff(d1,patch.nextReviewAt) === 16,"step 2 success must schedule +16d");
patch = core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:3},"good",d1);
assert(patch.reviewStep === 4 && dayDiff(d1,patch.nextReviewAt) === 21,"step 3 success must schedule +21d");
patch = core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:4},"good",d1);
assert(patch.memoryState === "stable" && dayDiff(d1,patch.nextReviewAt) === 30,"21d success must enter Stable with +30d maintenance");
patch = core.reviewSchedulePatch({memoryState:"stable",stableStep:0,reviewStep:4},"good",d1);
assert(patch.stableStep === 1 && dayDiff(d1,patch.nextReviewAt) === 45,"Stable maintenance must advance 30 -> 45");

const fail = core.reviewSchedulePatch({memoryState:"reinforcing",reviewStep:3},"again",d1);
assert(fail.memoryState === "review_again" && fail.reviewAgainOriginStep === 3,"failed recall must enter Review Again");
assert(dayDiff(d1,fail.nextReviewAt) === 0,"first failure must be eligible for same-day repair retest");
const sameDay = core.reviewSchedulePatch({memoryState:"review_again",reviewStep:3,reviewAgainOriginStep:3,reviewAgainFailedOn:"2026-09-01",sameDayRetestUsedOn:"2026-09-01"},"good",d1);
assert(sameDay.memoryState === "review_again" && dayDiff(d1,sameDay.nextReviewAt) === 1,"same-day retest must never restore long interval");
const nextDay = core.reviewSchedulePatch({memoryState:"review_again",reviewStep:3,reviewAgainOriginStep:3,reviewAgainFailedOn:"2026-09-01",sameDayRetestUsedOn:"2026-09-01"},"good",d2);
assert(nextDay.memoryState === "reinforcing" && nextDay.reviewStep === 2,"next-day successful validation must recover one step lower");
assert(dayDiff(d2,nextDay.nextReviewAt) === 7,"recovered step 2 must schedule +7d");

const plan = core.normalizeData({settings:{dailyGoal:3},cards:[
  {id:"r",stage:"review",nextReviewAt:d1.toISOString(),reviewStep:0,createdAt:d1.toISOString()},
  {id:"m",stage:"memorize1",stageEligibleOn:d1.toISOString(),createdAt:d1.toISOString(),inboxPending:false},
  {id:"v",stage:"visualize",stageEligibleOn:d1.toISOString(),createdAt:d1.toISOString(),inboxPending:false},
  {id:"p",stage:"apply",stageEligibleOn:d1.toISOString(),createdAt:d1.toISOString(),inboxPending:false},
  {id:"s",stage:"select",todaySelectedOn:"2026-09-01",createdAt:d1.toISOString(),inboxPending:false},
  {id:"i",stage:"select",createdAt:d1.toISOString(),inboxPending:true},
]},d1).dailyPlan;
eq([plan.review.length,plan.memorize.length,plan.visualize.length,plan.apply.length,plan.select.length,plan.inbox.length],[1,1,1,1,1,1],"DailyPlan stage buckets are incorrect");
assert(plan.remainingSelectSlots === 2,"daily goal must be a target, not accumulated debt");
assert(core.firstPlanStage(plan) === "review","Review must be first Today task");

console.log("Learning Engine V2 contract checks passed.");