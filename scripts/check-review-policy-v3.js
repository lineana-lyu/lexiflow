const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
function eq(actual,expected,message){const a=JSON.stringify(actual),e=JSON.stringify(expected);if(a!==e)throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);}

const root=path.join(__dirname,"..");
const source=fs.readFileSync(path.join(root,"public","learning-core-v3.js"),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:"learning-core-v3.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

const indexHtml=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const policyIndex=indexHtml.indexOf("review-policy-v3.js");
const visualIndex=indexHtml.indexOf("visualize-actions-v3.js");
assert(policyIndex>=0,"review-policy-v3.js must be loaded by index.html");
assert(visualIndex>=0,"visualize-actions-v3.js must be loaded by index.html");
assert(policyIndex<visualIndex,"Review workload surface must load before later stage decorators");
assert(!indexHtml.includes('<script src="./review-policy-v2.js"></script>'),"retired Review Policy V2 must not return to runtime");

const policyUi=fs.readFileSync(path.join(root,"public","review-policy-v3.js"),"utf8");
assert(!policyUi.includes("复习与学习负荷"),"automatic review workload must not be exposed as a Settings panel");
assert(!policyUi.includes("settingsHtml")&&!policyUi.includes("decorateSettings"),"Review scheduling must stay out of Settings");
assert(!policyUi.includes("Review V4")&&!policyUi.includes("Stable 今日"),"internal scheduling labels must not reach users");
assert(policyUi.includes("function syncFromGateway"),"Review hint surface must reuse the shared Learning Data Gateway snapshot");
assert(policyUi.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Review hint surface must prefer the gateway snapshot");
assert(policyUi.includes("今天没有复习任务"),"Today hint must use user-facing review language");

const d1=new Date(2026,8,1,12,0,0,0);
const d2=new Date(2026,8,2,12,0,0,0);
function criticalCards(n,due=d1){return Array.from({length:n},(_,i)=>({id:`c${String(i+1).padStart(2,"0")}`,stage:"review",memoryState:"reinforcing",reviewStep:i%5,nextReviewAt:due.toISOString(),createdAt:new Date(2026,7,1,0,i,0,0).toISOString()}));}
function stableCards(n,due=d1,stableStep=0,prefix="s"){return Array.from({length:n},(_,i)=>({id:`${prefix}${String(i+1).padStart(2,"0")}`,stage:"review",memoryState:"stable",reviewStep:4,stableStep,nextReviewAt:due.toISOString(),createdAt:new Date(2026,6,1,0,i,0,0).toISOString()}));}

assert(core.PLAN_VERSION===5,"Review V4 must bump DailyPlan version to 5");
eq(core.STABLE_WINDOWS,[2,3,4,5],"Stable maintenance windows must match 30/45/68/90-day ladder tolerance");
assert(core.reviewPolicy({reviewMode:"all",reviewCustomCap:1}).mode==="adaptive-v4","legacy Review mode settings must no longer control scheduling");
assert(core.reviewPolicy({reviewMode:"custom",reviewCustomCap:1}).cap===null,"Review V4 must have no hard critical-review cap");

let data=core.normalizeData({settings:{dailyGoal:3},cards:criticalCards(37)},d1);
assert(data.dailyPlan.reviewMode==="adaptive-v4"&&data.dailyPlan.reviewCap===null,"Review V4 must advertise adaptive workload with no hard cap");
assert(data.dailyPlan.review.length===37,"all 37 critical due reviews must remain in Today");
assert(data.dailyPlan.reviewCriticalCount===37,"critical review count must be explicit");
assert(data.dailyPlan.reviewDeferredCount===0&&data.dailyPlan.reviewStableDeferredCount===0,"critical review must never be reported as deferred");
assert(data.dailyPlan.selectGoal===0&&data.dailyPlan.remainingSelectSlots===0,"heavy Review load must pause new-word intake before dropping critical reviews");
assert(data.dailyPlan.noReviewDebt===true,"Review V4 must not manufacture duplicate review debt");

for(const [count,goal] of [[8,3],[9,2],[13,1],[17,0]]){
  const sample=core.normalizeData({settings:{dailyGoal:3},cards:criticalCards(count)},d1);
  assert(sample.dailyPlan.selectGoal===goal,`critical Review pressure ${count} should adapt new-word goal to ${goal}`);
}
assert(core.adaptiveNewWordGoal(6,9)===4,"9-12 scheduled reviews should reduce a 6-word goal to about two-thirds");
assert(core.adaptiveNewWordGoal(6,13)===2,"13-16 scheduled reviews should reduce a 6-word goal to about one-third");
assert(core.adaptiveNewWordGoal(6,17)===0,"17+ scheduled reviews should pause new words");

const stableDue=core.normalizeData({settings:{dailyGoal:3},cards:stableCards(10,d1)},d1);
assert(stableDue.dailyPlan.review.length===6,"Stable due maintenance may be smoothed to the normal daily target");
assert(stableDue.dailyPlan.reviewStableScheduledCount===6&&stableDue.dailyPlan.reviewStableDeferredCount===4,"Stable smoothing must expose scheduled and deferred maintenance counts");
assert(stableDue.dailyPlan.reviewCriticalCount===0,"Stable maintenance must not be misclassified as critical review");
assert(stableDue.dailyPlan.selectGoal===3,"six Stable maintenance items should not reduce the default new-word goal");

const nearDate=new Date(d1);nearDate.setDate(nearDate.getDate()+2);
const stableNear=core.normalizeData({settings:{dailyGoal:3},cards:stableCards(4,nearDate,0,"n")},d1);
assert(stableNear.dailyPlan.review.length===4,"Stable maintenance may be pulled forward inside its safe window");
assert(stableNear.dailyPlan.reviewStablePulledForwardCount===4,"pulled-forward Stable count must be explicit");
assert(stableNear.dailyPlan.reviewDueTotal===0,"pulled-forward Stable work is planned maintenance, not falsely labelled overdue");

const urgentDate=new Date(d1);urgentDate.setDate(urgentDate.getDate()-3);
const stableUrgent=core.normalizeData({settings:{dailyGoal:3},cards:stableCards(8,urgentDate,0,"u")},d1);
assert(stableUrgent.dailyPlan.review.length===8,"Stable items beyond the ±2-day window must all become urgent");
assert(stableUrgent.dailyPlan.reviewStableUrgentCount===8&&stableUrgent.dailyPlan.reviewStableDeferredCount===0,"urgent Stable work must not be deferred again");

const legacyCards=criticalCards(37);
const legacyIds=legacyCards.slice(0,20).map(card=>card.id);
const legacyPlan={
  date:"2026-09-01",generatedAt:d1.toISOString(),planVersion:4,frozen:true,noVocabularyDebt:true,
  review:legacyIds,memorize:[],visualize:[],apply:[],select:[],inbox:[],reviewMode:"intelligent",reviewCap:20,
  reviewDueTotal:37,reviewDeferredCount:17,selectGoal:3,selectedToday:[],remainingSelectSlots:3,
  initialTaskIds:legacyIds,taskTotal:20,taskRemaining:20,taskCompleted:0,taskProgressPercent:0,
};
const sameDay=core.normalizeData({settings:{dailyGoal:3},cards:legacyCards,dailyPlan:legacyPlan},new Date(2026,8,1,18,0,0,0));
eq(sameDay.dailyPlan.review,legacyIds,"upgrading Review policy must not rewrite an already-frozen same-day queue");
assert(sameDay.dailyPlan.selectGoal===3,"same-day frozen new-word allowance must remain stable during upgrade");
assert(sameDay.dailyPlan.reviewLoadMode==="frozen-legacy","same-day legacy plan must be visibly marked as frozen legacy behavior");

const nextDayCards=criticalCards(37,d2);
const nextDay=core.normalizeData({settings:{dailyGoal:3},cards:nextDayCards,dailyPlan:sameDay.dailyPlan},d2);
assert(nextDay.dailyPlan.review.length===37,"next StudyDay must activate Review V4 and protect every critical due item");
assert(nextDay.dailyPlan.selectGoal===0,"next StudyDay must reduce new-word intake under heavy review pressure");
assert(nextDay.dailyPlan.reviewLoadMode==="adaptive-v4","new StudyDay must leave frozen-legacy mode");

console.log("Review workload V4 checks passed.");
