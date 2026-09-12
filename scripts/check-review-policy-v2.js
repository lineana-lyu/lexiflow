const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
function eq(actual,expected,message){const a=JSON.stringify(actual),e=JSON.stringify(expected);if(a!==e)throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);}

const source=fs.readFileSync(path.join(__dirname,"..","public","learning-core-v2.js"),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:"learning-core-v2.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

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
assert(firstDeferred===7,"planned Review items must sort before deferred due items so legacy queue cannot consume extras first");
assert(sorted.slice(0,7).every(card=>planned.has(card.id)),"first Review cards must all belong to the frozen plan");

assert(core.reviewPolicy({reviewMode:"custom",reviewCustomCap:0}).cap===1,"custom Review cap must clamp to at least 1");
assert(core.reviewPolicy({reviewMode:"custom",reviewCustomCap:999}).cap===200,"custom Review cap must clamp to 200");
assert(core.reviewPolicy({reviewMode:"unknown"}).mode==="intelligent","unknown Review mode must fall back to intelligent");

console.log("Review Policy V2 checks passed.");