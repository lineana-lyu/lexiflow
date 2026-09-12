const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const sandbox={window:{},console,Date,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(read("public/learning-core-v2.js"),sandbox,{filename:"learning-core-v2.js"});
const core=sandbox.window.LexiFlowLearningCore;

assert(typeof core.canonicalStage==="function","Learning Core must expose canonicalStage");
assert(core.canonicalStage("memorize1")==="memorize","memorize1 must be compatibility-only");
assert(core.canonicalStage("memorize2")==="memorize","memorize2 must be compatibility-only");
assert(core.canonicalStage("memorize")==="memorize","canonical Memorize must remain stable");
const legacyM1=core.normalizeCard({id:"m1",stage:"memorize1",memorizeRound:1,customField:"keep"});
const legacyM2=core.normalizeCard({id:"m2",stage:"memorize2",memorizeRound:2,customField:"keep"});
assert(legacyM1.stage==="memorize"&&legacyM1.learningStage==="memorize","normalized memorize1 cards must physically expose canonical Memorize");
assert(legacyM2.stage==="memorize"&&legacyM2.learningStage==="memorize","normalized memorize2 cards must physically expose canonical Memorize");
assert(legacyM1.memorizeRound===1&&legacyM2.memorizeRound===2,"canonical stage migration must not discard Memorize round data");
assert(legacyM1.customField==="keep"&&legacyM2.customField==="keep","canonical stage migration must preserve unrelated card data");

const study=read("public/study-session-v3.js");
const memorize=read("public/memorize-stage-v3.js");
const advance=read("public/advance-learning-v3.js");
const gateway=read("public/learning-data-gateway-v3.js");
const transition=read("public/stage-transition-v3.js");

assert(study.includes("core.canonicalStage(card)"),"Study Session must bucket cards by canonical stage");
assert(!study.includes("currentStudyWord"),"Study Session must not infer card identity from rendered word text");
assert(memorize.includes('core.canonicalStage(card)==="memorize"'),"Memorize Stage V3 must own one canonical stage");
assert(!memorize.includes('card.stage==="memorize2"'),"Memorize direction must not be encoded in the persisted stage anymore");
assert(advance.includes("core.canonicalStage(card)"),"Advance Learning V3 must use canonical stage");
assert(gateway.includes("core.normalizeData"),"Learning Data Gateway V3 must canonicalize legacy persisted stages before app/runtime reads");
assert(!gateway.includes("memorize1")&&!gateway.includes("memorize2"),"Learning Data Gateway must delegate legacy-stage mapping to Learning Core instead of re-encoding sub-stages");
assert(transition.includes('card.stage="memorize"'),"Select completion must write canonical Memorize directly");
assert(transition.includes('card.learningStage="memorize"'),"Select completion must expose canonical Memorize immediately");
assert(transition.includes('nextStage:"memorize"'),"stage activity history must record canonical next stage");
assert(!transition.includes('card.stage="memorize1"'),"Stage Transition V3 must not create a legacy Memorize sub-stage");

console.log("Canonical Stage Model V3 checks passed.");