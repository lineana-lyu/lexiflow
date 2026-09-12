const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const transition=read("public/stage-transition-v2.js");
const memorize=read("public/memorize-stage-v3.js");
const visualize=read("public/visualize-actions-v3.js");
const apply=read("public/apply-actions-v3.js");

assert(transition.includes("stageCommandId"),"Select, Visualize and Apply completion must have deterministic command IDs");
assert(transition.includes("commandCommitted"),"normal stage completion must explicitly tolerate a retried command");
assert(transition.includes('appendActivity(data,card.id,"select",{nextStage:"memorize",commandId})'),"Select completion must persist its command ID and canonical next stage");
assert(transition.includes('appendActivity(data,card.id,"visualize",{skipped:false,nextStage:"apply",commandId})'),"normal Visualize completion must persist its command ID");
assert(transition.includes('appendActivity(data,card.id,"apply",{sentence,skipped:false,nextStage:"review",commandId})'),"normal Apply completion must persist its command ID");

assert(memorize.includes("function commandId("),"Memorize completion must have a deterministic command ID");
assert(memorize.includes("commandCommitted(data,cmd)"),"Memorize completion must be safe to retry after persistence");
assert(memorize.includes("commandId:cmd"),"Memorize completion activity must persist its command ID");
assert(memorize.includes("const initialWeak=!(round1.en===true&&round1.zh===true)"),"initialMemoryWeak must reflect first-round recall, not a successful reinforcement round");
assert(memorize.includes("finalRoundPassed"),"Memorize history must distinguish initial weakness from final reinforcement outcome");
assert(memorize.includes("if(saving)return"),"Memorize UI must reject double completion clicks while persistence is in flight");
assert(memorize.includes('core.canonicalStage(c)!=="memorize"'),"Memorize completion must validate the canonical stage before writing");

assert(visualize.includes(":visualize-skip`"),"Visualize skip must have a distinct deterministic command ID");
assert(visualize.includes("commandId:cmd"),"Visualize skip activity must persist its command ID");
assert(visualize.includes("finally{saving=false;}"),"Visualize skip must always release its saving lock after an early return or failure");
assert(visualize.includes('data-visual-actions-v3="skip"'),"Visualize skip control must use the V3 action surface");
assert(visualize.includes('core.canonicalStage(current)==="visualize"'),"Visualize skip must validate the canonical stage");

assert(apply.includes(":apply-skip`"),"Apply skip must have a distinct deterministic command ID");
assert(apply.includes("commandCommitted(data,commandId)"),"Apply skip must tolerate a retried command");
assert(apply.includes("commandId"),"Apply skip history must retain command identity");

console.log("Stage Commands V3 checks passed.");