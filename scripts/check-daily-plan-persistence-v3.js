const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const persistence=read("public/daily-plan-persistence-v3.js");

assert(index.includes('<script src="./daily-plan-persistence-v3.js"></script>'),"DailyPlan Persistence V3 must be active");
assert(!index.includes('<script src="./daily-plan-persistence-v2.js"></script>'),"DailyPlan Persistence V2 must be retired from runtime");
assert(!exists("public/daily-plan-persistence-v2.js"),"DailyPlan Persistence V2 source must stay deleted after promotion");
assert(persistence.includes("LexiFlowLearningCore"),"DailyPlan Persistence V3 must normalize through Learning Core");
assert(persistence.includes('fetch("/api/learning-data",{cache:"no-store"})'),"DailyPlan Persistence V3 must explicitly read the current learning data once");
assert(persistence.includes('method:"POST"'),"DailyPlan Persistence V3 must explicitly persist the frozen plan");
assert(persistence.includes('dailyPlanAuthority:"v3"'),"DailyPlan Persistence V3 writes must identify their authority");
assert(persistence.includes("dailyPlanPersistedKey"),"DailyPlan Persistence V3 must keep an idempotent persisted marker");
assert(persistence.includes("plan.generatedAt"),"the persisted marker must bind to the exact frozen plan generation");
assert(!persistence.includes("window.fetch="),"DailyPlan Persistence V3 must not monkey-patch global fetch or persist as a hidden GET side effect");
assert(persistence.includes("window.LexiFlowDailyPlanPersistenceV3=Object.freeze"),"DailyPlan Persistence V3 must expose only a narrow explicit persistence bridge");

console.log("DailyPlan Persistence V3 checks passed.");
