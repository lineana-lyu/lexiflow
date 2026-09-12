const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
function dayDiff(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}

const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));
const coreSource=read("public/learning-core-v2.js");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(coreSource,sandbox,{filename:"learning-core-v2.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

const d1=new Date(2026,8,1,12,0,0,0);
const earlyPrev={stage:"memorize",learningStage:"memorize",earlyStudyOn:"2026-09-01",earlyStudyAt:d1.toISOString(),earlyOriginalStageEligibleOn:"2026-09-02"};
const earlyPatch=core.crossDayPatch(earlyPrev,{stage:"visualize"},d1);
assert(earlyPatch.lastEarlyStudiedOn==="2026-09-01","completed early stage must record the StudyDay allowance was used");
assert(earlyPatch.earlyStudyOn===null&&earlyPatch.earlyStudyAt===null,"completed early stage must clear active early-learning markers");
assert(dayDiff(d1,earlyPatch.stageEligibleOn)===1,"early learning must not chain another stage on the same day");

const normalPatch=core.crossDayPatch({stage:"memorize"},{stage:"visualize"},d1);
assert(!Object.prototype.hasOwnProperty.call(normalPatch,"lastEarlyStudiedOn"),"normal stage completion must not be labeled as early learning");

const moduleSource=read("public/advance-learning-v3.js");
assert(moduleSource.includes('stageEligibleOn=today'),"explicit early-learning action must unlock only the chosen stage for today");
assert(moduleSource.includes('earlyAllowanceUsedOn=today'),"one item may consume only one optional early-stage allowance per StudyDay");
assert(moduleSource.includes('core.canonicalStage(card)'),"early-learning candidates must use the canonical learning stage");
assert(moduleSource.includes('if(stage==="memorize")return"memorize"'),"Memorize must be a supported canonical early-learning stage");
assert(moduleSource.includes('if(stage==="visualize")return"visualize"'),"Visualize must be a supported early-learning stage");
assert(moduleSource.includes('if(stage==="apply")return"apply"'),"Apply must be a supported early-learning stage");
assert(!moduleSource.includes('return"review"'),"Review must never be unlocked early");
assert(!moduleSource.includes('memorize2:"Memorize"'),"early-learning domain config must not expose split Memorize stages");
assert(moduleSource.includes('advanceLearningAuthority:"v3"'),"Advance Learning V3 persistence must identify its authority");
assert(moduleSource.includes('authority:"advance-learning-v3"'),"early-learning activity must identify its V3 authority");
assert(moduleSource.includes("!core.firstPlanStage(plan)"),"optional early learning must appear only after normal Today work is complete");
assert(moduleSource.includes("next.dailyPlan[bucket]"),"optional early learning must explicitly append the selected card to the frozen DailyPlan bucket");
assert(!moduleSource.includes('.querySelector(".lexi-inbox")'),"Advance Learning V3 must not depend on the retired standalone Inbox surface");
assert(moduleSource.includes("LexiFlowAdvanceLearningV3=Object.freeze"),"Advance Learning V3 must expose a narrow explicit bridge");

const index=read("public/index.html");
const coreIndex=index.indexOf("learning-core-v2.js");
const todayIndex=index.indexOf("today-plan-v3.js");
const advanceIndex=index.indexOf("advance-learning-v3.js");
const appIndex=index.indexOf("app.js");
assert(coreIndex>=0&&advanceIndex>coreIndex&&advanceIndex>todayIndex&&advanceIndex<appIndex,"advance-learning-v3.js must load after Core/Today Plan and before app shell");
assert(!index.includes('<script src="./advance-learning-v2.js"></script>'),"Advance Learning V2 must not remain in runtime");
assert(!exists("public/advance-learning-v2.js"),"Advance Learning V2 source must stay deleted");

console.log("Advance Learning V3 checks passed.");
