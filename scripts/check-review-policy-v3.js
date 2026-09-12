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
assert(policyIndex<visualIndex,"Review policy controls must load before later stage decorators");
assert(!indexHtml.includes('<script src="./review-policy-v2.js"></script>'),"retired Review Policy V2 must not return to runtime");
assert(!indexHtml.includes('<script src="./visualize-v2.js"></script>'),"retired Visualize V2 actions must not return to runtime");

const policyUi=fs.readFileSync(path.join(root,"public","review-policy-v3.js"),"utf8");
assert(policyUi.includes("复习与巩固"),"settings must describe this layer as Review & Reinforcement");
assert(policyUi.includes("1 → 3 → 7 → 16 → 21"),"settings must explain the deterministic reinforcement ladder");
assert(policyUi.includes("30 → 45 → 68 → 90"),"settings must explain Stable maintenance intervals");
assert(policyUi.includes("下一学习日必须再次验证"),"settings must explain next-day validation after a first-recall failure");
assert(policyUi.includes("跟随系统安排"),"default daily review load must be framed as following the system schedule");
assert(!policyUi.includes("复习方式"),"review method customization must be removed from the normal settings surface");
assert(!policyUi.includes("高级设置"),"question-type advanced settings must be removed from the settings surface");
assert(!policyUi.includes("data-review-weight"),"question-type weights must no longer be user-editable");
assert(!policyUi.includes("data-review-type"),"question-type toggles must no longer be user-editable");

const d1=new Date(2026,8,1,12,0,0,0);
const d2=new Date(2026,8,2,12,0,0,0);
function dueCards(n){return Array.from({length:n},(_,i)=>({id:`r${String(i+1).padStart(2,"0")}`,stage:"review",memoryState:"reinforcing",reviewStep:0,nextReviewAt:d1.toISOString(),createdAt:new Date(2026,7,1,i,0,0,0).toISOString()}));}

let data=core.normalizeData({settings:{},cards:dueCards(37)},d1);
assert(data.dailyPlan.reviewMode==="intelligent","default Review mode must be intelligent");
assert(data.dailyPlan.reviewCap===20,"default intelligent Review cap must be 20");
assert(data.dailyPlan.review.length===20,"intelligent mode must cap Today Review at 20");
assert(data.dailyPlan.reviewDueTotal===37&&data.dailyPlan.reviewDeferredCount===17,"Review plan must expose scheduled vs due totals");

data=core.normalizeData({settings:{reviewMode:"all"},cards:dueCards(37)},d1);
assert(data.dailyPlan.reviewMode==="all"&&data.dailyPlan.reviewCap===null,"ALL mode must have no cap");
assert(data.dailyPlan.review.length===37&&data.dailyPlan.reviewDeferredCount===0,"ALL mode must schedule every due item");

data=core.normalizeData({settings:{reviewMode:"custom",reviewCustomCap:7},cards:dueCards(37)},d1);
assert(data.dailyPlan.reviewMode==="custom"&&data.dailyPlan.reviewCap===7,"custom mode must preserve selected cap");
assert(data.dailyPlan.review.length===7&&data.dailyPlan.reviewDeferredCount===30,"custom mode must cap scheduled Review items");

const frozen=data.dailyPlan;
const changedSameDay=core.normalizeData({settings:{reviewMode:"all"},cards:dueCards(37),dailyPlan:frozen},new Date(2026,8,1,18,0,0,0));
eq(changedSameDay.dailyPlan.review,frozen.review,"changing Review settings must not mutate same-day frozen Review membership");
assert(changedSameDay.dailyPlan.reviewMode==="custom"&&changedSameDay.dailyPlan.reviewCap===7,"same-day frozen Review policy metadata must remain stable");

const nextDayCards=dueCards(37).map(card=>({...card,nextReviewAt:d2.toISOString()}));
const changedNextDay=core.normalizeData({settings:{reviewMode:"all"},cards:nextDayCards,dailyPlan:frozen},d2);
assert(changedNextDay.dailyPlan.date==="2026-09-02","next StudyDay must rebuild DailyPlan");
assert(changedNextDay.dailyPlan.reviewMode==="all"&&changedNextDay.dailyPlan.review.length===37,"new StudyDay must apply latest Review settings");

const planned=new Set(frozen.review);
const sorted=changedSameDay.cards.filter(card=>card.stage==="review");
const firstDeferred=sorted.findIndex(card=>!planned.has(card.id));
assert(firstDeferred===7,"planned Review items must sort before deferred due items so runtime cannot consume extras first");
assert(sorted.slice(0,7).every(card=>planned.has(card.id)),"first Review cards must all belong to the frozen plan");

assert(core.reviewPolicy({reviewMode:"custom",reviewCustomCap:0}).cap===1,"custom Review cap must clamp to at least 1");
assert(core.reviewPolicy({reviewMode:"custom",reviewCustomCap:999}).cap===200,"custom Review cap must clamp to 200");
assert(core.reviewPolicy({reviewMode:"unknown"}).mode==="intelligent","unknown Review mode must fall back to intelligent");

console.log("Review Policy V3 checks passed.");