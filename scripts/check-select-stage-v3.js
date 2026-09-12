const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const select=read("public/select-stage-v3.js");
const transition=read("public/stage-transition-v2.js");

assert(index.includes("select-stage-v3.js"),"Select Stage V3 must be loaded by index.html");
assert(index.indexOf("study-session-v3.js")<index.indexOf("select-stage-v3.js"),"Select renderer must attach after Study Session has established explicit-card identity");
assert(select.includes("LexiFlowStudyRenderer?.currentCardId"),"Select renderer must bind to the explicit Study Session card ID");
assert(select.includes('core.canonicalStage(card)==="select"'),"Select renderer must use the canonical stage model");
assert(select.includes('data-next="memorize"'),"Select UI must expose canonical Memorize as the next product stage");
assert(select.includes("LexiFlowNaturalTts?.play"),"Select renderer must preserve pronunciation support");
assert(!select.includes("activeLearningCards"),"Select renderer must never choose its own learning card");
assert(transition.includes('data-next="memorize"'),"authoritative Select transition must accept the canonical next-stage control");

console.log("Select Stage V3 checks passed.");