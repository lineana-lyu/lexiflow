const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const source=read("public/learning-data-gateway-v3.js");

assert(index.includes('<script src="./learning-data-gateway-v3.js"></script>'),"Learning Data Gateway V3 must be active");
assert(!index.includes('<script src="./learning-engine-v2.js"></script>'),"Learning Engine V2 must not remain in the runtime load chain");
assert(!exists("public/learning-engine-v2.js"),"Learning Engine V2 source must stay deleted after gateway promotion");
assert(!index.includes('<script src="./legacy-data-fix.js"></script>'),"legacy data fetch shim must not remain in the runtime load chain");
assert(!exists("public/legacy-data-fix.js"),"legacy data fetch shim must stay deleted after gateway consolidation");
assert(index.indexOf("learning-core-v2.js")<index.indexOf("learning-data-gateway-v3.js"),"Learning Core must load before the V3 data gateway");
assert(index.indexOf("learning-data-gateway-v3.js")<index.indexOf("studyday-boundary-v3.js"),"V3 data gateway must normalize learning data before downstream runtime modules");
assert(source.includes('endpoint!=="/api/learning-data"'),"gateway must be scoped to the learning-data endpoint");
assert(source.includes("core.normalizeData"),"gateway must normalize every learning dataset");
assert(source.includes("core.crossDayPatch"),"gateway must preserve deterministic cross-day guards for non-stage app writes");
assert(source.includes("core.buildDailyPlan"),"gateway must preserve the frozen DailyPlan model on writes");
assert(source.includes('learningDataAuthority:body.learningDataAuthority||"gateway-v3"'),"gateway writes must identify V3 authority");
assert(source.includes("repairLegacyMeanings"),"gateway must absorb the old safe Chinese-meaning migration");
assert(source.includes('migrationAuthority:"legacy-meaning-v3"'),"legacy meaning repairs must be explicitly identified when persisted");
assert(source.includes("LexiFlowLearningDataGatewayV3=Object.freeze"),"gateway must expose only a narrow diagnostics bridge");
assert(!source.includes("/api/ai/visual-scene"),"learning-data gateway must not intercept AI behavior");
assert(!source.includes("MutationObserver")&&!source.includes("setInterval"),"learning-data gateway must not own UI decoration or polling");
assert(!source.includes("连续学习")&&!source.includes("initial-review-rate")&&!source.includes("review-rate"),"gateway must not contain retired product UI behavior");

console.log("Learning Data Gateway V3 checks passed.");
