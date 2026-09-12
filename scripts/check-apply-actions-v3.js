const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const apply=read("public/apply-actions-v3.js");
const transition=read("public/stage-transition-v2.js");
const visual=read("public/visualize-v2.js");
const source=read("public/source-context-v2.js");
const fresh=read("public/new-user-defaults-v3.js");

assert(index.includes("apply-actions-v3.js"),"Apply Actions V3 must be loaded by index.html");
assert(index.indexOf("app.js")<index.indexOf("apply-actions-v3.js"),"Apply actions must decorate after the app renderer exists");
assert(apply.includes('data-apply-v3="draft"'),"Apply must expose an explicit save-draft action");
assert(apply.includes('data-apply-v3="skip"'),"Apply must expose an explicit skip action");
assert(apply.includes("applyDraftSavedAt"),"saving a draft must persist a durable draft checkpoint");
assert(apply.includes("applySkipped=true"),"skip must be recorded explicitly instead of being confused with completion");
assert(apply.includes('skipped:true'),"Apply skip activity must be distinguishable in history");
assert(apply.includes("core.crossDayPatch"),"Apply skip must use the same deterministic cross-day transition authority");
assert(apply.includes("LexiFlowStudySessionV3?.pause"),"saving a draft must pause the resumable Study Session");
assert(apply.includes("再次点击确认跳过"),"Apply skip must require an explicit second confirmation click");

assert(transition.includes("currentStudyCardId"),"stage transitions must resolve the exact rendered card ID");
assert(!transition.includes("function domWord("),"stage transitions must not infer Apply identity from DOM word text");
assert(transition.includes('card.applySkipped=false'),"successful Apply completion must clear a previous skip marker");
assert(transition.includes('card.applyDraft=""'),"successful Apply completion must clear the durable draft field");

assert(visual.includes("LexiFlowStudyRenderer?.currentCardId"),"Visualize skip must bind to the exact study card ID");
assert(!visual.includes(".trim().toLowerCase()===word"),"Visualize must not resolve cards by word text");
assert(source.includes("LexiFlowStudyRenderer?.currentCardId"),"source reminders must bind to the exact study card ID");
assert(!source.includes("trim().toLowerCase()===word"),"source reminders must not resolve the learning card by word text");

assert(index.includes("new-user-defaults-v3.js"),"fresh-user defaults must be loaded by index.html");
assert(fresh.includes('payload.hasStoredData!==false'),"three-word migration must only touch a genuinely fresh data store");
assert(fresh.includes("TARGET_GOAL=3"),"fresh users must start with the three-word target");

console.log("Apply Actions V3 checks passed.");
