const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
function eq(actual,expected,message){
  const a=JSON.stringify(actual),e=JSON.stringify(expected);
  if(a!==e)throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
}
function at(y,m,d){return new Date(y,m-1,d,12,0,0,0);}
function clone(value){return JSON.parse(JSON.stringify(value));}
function diffDays(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}

const root=path.join(__dirname,"..");
const coreSource=fs.readFileSync(path.join(root,"public","learning-core-v3.js"),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(coreSource,sandbox,{filename:"learning-core-v3.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"Learning Core V3 did not initialize");

const id="journey-card";
const cardOf=data=>data.cards.find(card=>card.id===id);
const has=(plan,key)=>Array.isArray(plan?.[key])&&plan[key].includes(id);
const taskCount=plan=>["review","memorize","visualize","apply","select"].reduce((sum,key)=>sum+(plan?.[key]?.filter(value=>value===id).length||0),0);

function nextDay(data,now){
  return core.normalizeData(clone(data),now);
}

function completeStage(data,nextStage,now){
  const source=cardOf(data);
  const patch=core.crossDayPatch(source,{stage:nextStage},now);
  assert(patch,`${core.canonicalStage(source)} -> ${nextStage} must have a deterministic cross-day patch`);
  source.stage=nextStage;
  Object.assign(source,patch,{updatedAt:now.toISOString()});
  return core.normalizeData(data,now);
}

function completeReview(data,now){
  const source=cardOf(data);
  assert(core.isDue(source,now),`Review must be due on ${core.dayKey(now)} before completion`);
  Object.assign(source,core.reviewSchedulePatch(source,"good",now),{updatedAt:now.toISOString()});
  return core.normalizeData(data,now);
}

// Day 1: a newly captured word is Pending and must not enter Today by itself.
const d1=at(2026,9,1);
let data=core.normalizeData({
  settings:{dailyGoal:3},
  cards:[{
    id,word:"address",meaningZh:"处理；应对",stage:"select",inboxPending:true,
    createdAt:d1.toISOString(),
  }],
  activities:[],
},d1);
assert(has(data.dailyPlan,"inbox"),"newly captured vocabulary must remain Pending in Word Library");
assert(!has(data.dailyPlan,"select"),"Pending vocabulary must not enter Today Select automatically");
assert(data.dailyPlan.taskTotal===0,"Pending-only vocabulary must not inflate today's frozen denominator");

// Explicit learner selection adds the card to the frozen Select bucket on the same StudyDay.
let card=cardOf(data);
card.inboxPending=false;
card.todaySelectedOn=core.dayKey(d1);
card.inboxSelectedAt=d1.toISOString();
data=core.normalizeData(data,d1);
assert(has(data.dailyPlan,"select"),"explicit Pending -> Today selection must add the card to Select");
assert(!has(data.dailyPlan,"inbox"),"Today-selected vocabulary must leave Pending");
assert(data.dailyPlan.taskTotal===1&&data.dailyPlan.taskRemaining===1,"Today denominator must include the explicitly selected card exactly once");

// Select completes today, but Memorize cannot appear until the next StudyDay.
data=completeStage(data,"memorize",d1);
assert(core.canonicalStage(cardOf(data))==="memorize","Select completion must persist canonical Memorize");
assert(!has(data.dailyPlan,"memorize")&&!has(data.dailyPlan,"select"),"Select completion must not unlock same-day Memorize");
assert(data.dailyPlan.taskCompleted===1&&data.dailyPlan.taskRemaining===0,"finishing Select must complete the frozen Day-1 task");

// Day 2: Memorize only.
const d2=at(2026,9,2);
data=nextDay(data,d2);
eq([has(data.dailyPlan,"memorize"),has(data.dailyPlan,"visualize"),has(data.dailyPlan,"apply"),has(data.dailyPlan,"review")],[true,false,false,false],"Day 2 must expose Memorize and no future stage");
data=completeStage(data,"visualize",d2);
assert(!has(data.dailyPlan,"visualize"),"Memorize completion must not unlock same-day Visualize");

// Day 3: Visualize only; learner-owned image checkpoint may exist before explicit finish.
const d3=at(2026,9,3);
data=nextDay(data,d3);
eq([has(data.dailyPlan,"visualize"),has(data.dailyPlan,"apply"),has(data.dailyPlan,"review")],[true,false,false],"Day 3 must expose Visualize only");
card=cardOf(data);
card.visualImageUrl="local://journey-image";
card.visualImageConfirmed=false;
card.visualImagePreparedAt=d3.toISOString();
data=completeStage(data,"apply",d3);
card=cardOf(data);
card.visualImageConfirmed=true;
card.visualImageConfirmedAt=d3.toISOString();
assert(!has(data.dailyPlan,"apply"),"Visualize completion must not unlock same-day Apply");

// Day 4: Apply only; first Review is scheduled for the next StudyDay.
const d4=at(2026,9,4);
data=nextDay(data,d4);
eq([has(data.dailyPlan,"apply"),has(data.dailyPlan,"review")],[true,false],"Day 4 must expose Apply without same-day Review");
data=completeStage(data,"review",d4);
card=cardOf(data);
assert(card.memoryState==="reinforcing"&&card.reviewStep===0,"Apply completion must enter reinforcing Review step 0");
assert(diffDays(d4,card.nextReviewAt)===1,"Apply completion must schedule first Review for the next StudyDay");
assert(!has(data.dailyPlan,"review"),"Apply completion must not create same-day initial Review");

// Day 5: first active recall.
const d5=at(2026,9,5);
data=nextDay(data,d5);
assert(has(data.dailyPlan,"review")&&core.firstPlanStage(data.dailyPlan)==="review","first Review must be the Day-5 priority task");
data=completeReview(data,d5);
card=cardOf(data);
assert(card.reviewStep===1&&diffDays(d5,card.nextReviewAt)===3,"first successful Review must advance to the 3-day interval");
assert(!has(data.dailyPlan,"review"),"completed Review must disappear from the frozen same-day queue");

// Miss the scheduled Sep 8 review and return Sep 10: one due item, never accumulated debt copies.
const d10=at(2026,9,10);
data=nextDay(data,d10);
assert(has(data.dailyPlan,"review"),"an overdue Review must remain due when the learner returns");
assert(data.dailyPlan.review.filter(value=>value===id).length===1,"missed days must not duplicate an overdue Review task");
assert(taskCount(data.dailyPlan)===1,"missed days must not manufacture extra learning debt for this card");
assert(data.dailyPlan.noVocabularyDebt===true,"the rebuilt StudyDay must preserve No Vocabulary Debt");
data=completeReview(data,d10);
card=cardOf(data);
assert(card.reviewStep===2&&diffDays(d10,card.nextReviewAt)===7,"second successful Review must advance to the 7-day interval from the actual StudyDay");

// Continue the deterministic reinforcement ladder: 7 -> 16 -> 21 -> Stable 30.
const d17=at(2026,9,17);
data=nextDay(data,d17);assert(has(data.dailyPlan,"review"),"7-day Review must become due");
data=completeReview(data,d17);card=cardOf(data);
assert(card.reviewStep===3&&diffDays(d17,card.nextReviewAt)===16,"7-day success must advance to 16 days");

const dOct3=at(2026,10,3);
data=nextDay(data,dOct3);assert(has(data.dailyPlan,"review"),"16-day Review must become due");
data=completeReview(data,dOct3);card=cardOf(data);
assert(card.reviewStep===4&&diffDays(dOct3,card.nextReviewAt)===21,"16-day success must advance to 21 days");

const dOct24=at(2026,10,24);
data=nextDay(data,dOct24);assert(has(data.dailyPlan,"review"),"21-day Review must become due");
data=completeReview(data,dOct24);card=cardOf(data);
assert(card.memoryState==="stable"&&card.reviewStep===4&&card.stableStep===0,"successful completion of the reinforcement ladder must enter Stable");
assert(diffDays(dOct24,card.nextReviewAt)===30,"Stable must begin with a 30-day maintenance interval");

// First Stable maintenance success advances 30 -> 45 without inventing a new product stage.
const dNov23=at(2026,11,23);
data=nextDay(data,dNov23);
assert(has(data.dailyPlan,"review"),"Stable maintenance remains a Review task, not a sixth stage");
assert(core.canonicalStage(cardOf(data))==="review","Stable must remain physically in canonical Review stage");
data=completeReview(data,dNov23);card=cardOf(data);
assert(card.memoryState==="stable"&&card.stableStep===1,"Stable maintenance success must advance stableStep");
assert(diffDays(dNov23,card.nextReviewAt)===45,"first Stable maintenance success must advance 30 -> 45 days");

console.log("Learning Journey V3 end-to-end deterministic checks passed.");
