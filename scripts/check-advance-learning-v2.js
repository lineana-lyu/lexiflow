const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
function dayDiff(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}

const root=path.join(__dirname,"..");
const coreSource=fs.readFileSync(path.join(root,"public","learning-core-v2.js"),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(coreSource,sandbox,{filename:"learning-core-v2.js"});
const core=sandbox.window.LexiFlowLearningCore;
assert(core,"learning core did not initialize");

const d1=new Date(2026,8,1,12,0,0,0);
const earlyPrev={stage:"memorize2",earlyStudyOn:"2026-09-01",earlyStudyAt:d1.toISOString(),earlyOriginalStageEligibleOn:"2026-09-02"};
const earlyPatch=core.crossDayPatch(earlyPrev,{stage:"visualize"},d1);
assert(earlyPatch.lastEarlyStudiedOn==="2026-09-01","completed early stage must record the StudyDay allowance was used");
assert(earlyPatch.earlyStudyOn===null&&earlyPatch.earlyStudyAt===null,"completed early stage must clear active early-learning markers");
assert(dayDiff(d1,earlyPatch.stageEligibleOn)===1,"early learning must not chain another stage on the same day");

const normalPatch=core.crossDayPatch({stage:"memorize2"},{stage:"visualize"},d1);
assert(!Object.prototype.hasOwnProperty.call(normalPatch,"lastEarlyStudiedOn"),"normal stage completion must not be labeled as early learning");

const moduleSource=fs.readFileSync(path.join(root,"public","advance-learning-v2.js"),"utf8");
assert(moduleSource.includes('stageEligibleOn=today'),"explicit early-learning action must unlock only the chosen stage for today");
assert(moduleSource.includes('earlyAllowanceUsedOn=today'),"one item may consume only one optional early-stage allowance per StudyDay");
assert(moduleSource.includes('if(stage==="memorize1"||stage==="memorize2")return"memorize"'),"Memorize must be a supported early-learning stage");
assert(moduleSource.includes('if(stage==="visualize")return"visualize"'),"Visualize must be a supported early-learning stage");
assert(moduleSource.includes('if(stage==="apply")return"apply"'),"Apply must be a supported early-learning stage");
assert(!moduleSource.includes('return"review"'),"Review must never be unlocked early");

const index=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
const coreIndex=index.indexOf("learning-core-v2.js");
const advanceIndex=index.indexOf("advance-learning-v2.js");
const appIndex=index.indexOf("app.js");
assert(coreIndex>=0&&advanceIndex>coreIndex&&advanceIndex<appIndex,"advance-learning-v2.js must load after Core and before legacy app");

console.log("Advance Learning V2 checks passed.");