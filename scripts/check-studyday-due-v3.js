const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const source=fs.readFileSync(path.join(root,"public","learning-core-v3.js"),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:"learning-core-v3.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

const morning=new Date(2026,8,21,8,0,0,0);
const noon=new Date(2026,8,21,12,0,0,0);
const lateNight=new Date(2026,8,21,23,50,0,0);
const tomorrowNoon=new Date(2026,8,22,12,0,0,0);

const dueToday={id:"today",stage:"review",memoryState:"reinforcing",nextReviewAt:noon.toISOString()};
assert(core.isDue(dueToday,morning)===true,"a Review due later on the same calendar day must already belong to that StudyDay");
assert(core.isDue(dueToday,lateNight)===true,"a Review remains due for the entire scheduled StudyDay");

const dueTomorrow={id:"tomorrow",stage:"review",memoryState:"reinforcing",nextReviewAt:tomorrowNoon.toISOString()};
assert(core.isDue(dueTomorrow,lateNight)===false,"tomorrow's Review must never leak into today's StudyDay");

const morningPlan=core.normalizeData({cards:[dueToday,dueTomorrow]},morning).dailyPlan;
assert(morningPlan.review.includes("today"),"morning Today Plan must include a card whose due timestamp is noon today");
assert(!morningPlan.review.includes("tomorrow"),"morning Today Plan must exclude tomorrow's card");

const nextMorning=new Date(2026,8,22,8,0,0,0);
const nextPlan=core.normalizeData({cards:[dueTomorrow]},nextMorning).dailyPlan;
assert(nextPlan.review.includes("tomorrow"),"the next StudyDay must include its due card from the start of the day");

assert(source.includes("valueDayKey(card.nextReviewAt) <= dayKey(now)"),"isDue must compare StudyDay keys instead of clock timestamps");
assert(!source.includes("new Date(card.nextReviewAt).getTime() <= now.getTime()"),"clock-time Review due semantics must not return");

console.log("StudyDay Review due V3 checks passed.");