const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const transition=read("public/stage-transition-v3.js");
const memorize=read("public/memorize-stage-v3.js");
const visualize=read("public/visualize-actions-v3.js");
const apply=read("public/apply-actions-v3.js");

assert(transition.includes("stageCommandId"),"Select, Visualize and Apply completion must have deterministic command IDs");
assert(transition.includes("commandCommitted"),"normal stage completion must explicitly tolerate a retried command");
assert(transition.includes('appendActivity(data,card.id,"select",{nextStage:"memorize",commandId})'),"Select completion must persist its command ID and canonical next stage");
assert(transition.includes('appendActivity(data,card.id,"visualize",{skipped:false,imageConfirmed:true,nextStage:"apply",commandId})'),"normal Visualize completion must persist its shared command ID and image confirmation outcome");
assert(transition.includes('appendActivity(data,card.id,"apply",{sentence,skipped:false,nextStage:"review",commandId})'),"normal Apply completion must persist its command ID");
assert(transition.includes('stageTransitionAuthority:"v3"'),"normal stage persistence must identify Stage Transition V3 authority");
assert(transition.includes('authority:"stage-transition-v3"'),"normal stage activities must identify Stage Transition V3 authority");
assert(transition.includes('card.stage="memorize"'),"Select completion must persist canonical Memorize directly");
assert(!transition.includes('card.stage="memorize1"'),"Stage Transition V3 must not write the retired Memorize sub-stage");
assert(transition.includes("beginStageWrite")&&transition.includes("endStageWrite"),"Stage Transition V3 must expose one shared stage-write lock for competing outcomes");
assert(transition.includes("terminalCommandId:stageCommandId"),"shared command identity must remain discoverable through the V3 transition bridge");
assert(transition.includes('beginStageWrite(cardId,"visualize",now)')&&transition.includes('beginStageWrite(cardId,"apply",now)'),"normal Visualize and Apply completion must enter the shared write scope before loading mutable data");
assert(transition.includes("card.visualImageConfirmed=true"),"Visualize image must become confirmed only in terminal Visualize completion");
assert(transition.includes("card.visualImageConfirmedAt=now.toISOString()"),"Visualize completion must timestamp the image confirmation checkpoint");

assert(memorize.includes("function commandId("),"Memorize completion must have a deterministic command ID");
assert(memorize.includes("commandCommitted(data,cmd)"),"Memorize completion must be safe to retry after persistence");
assert(memorize.includes("commandId:cmd"),"Memorize completion activity must persist its command ID");
assert(memorize.includes("const initialWeak=!(round1.en===true&&round1.zh===true)"),"initialMemoryWeak must reflect first-round recall, not a successful reinforcement round");
assert(memorize.includes("finalRoundPassed"),"Memorize history must distinguish initial weakness from final reinforcement outcome");
assert(memorize.includes("if(saving)return"),"Memorize UI must reject double completion clicks while persistence is in flight");
assert(memorize.includes('core.canonicalStage(c)!=="memorize"'),"Memorize completion must validate the canonical stage before writing");

assert(visualize.includes('beginStageWrite?.(id,"visualize",now)'),"Visualize skip must use the same exclusive stage-write scope as normal completion");
assert(!visualize.includes("visualize-skip"),"Visualize complete and skip outcomes must share one deterministic command identity");
assert(visualize.includes("commandId:cmd"),"Visualize skip activity must persist the shared command ID");
assert(visualize.includes("endStageWrite?.(write)"),"Visualize skip must always release the shared stage-write lock");
assert(visualize.includes('data-visual-actions-v3="skip"'),"Visualize skip control must use the V3 action surface");
assert(visualize.includes('core.canonicalStage(current)==="visualize"'),"Visualize skip must validate the canonical stage");

assert(apply.includes('beginStageWrite?.(id,"apply",now)'),"Apply Draft/Skip support must enter the shared Apply stage-write scope");
assert(!apply.includes("apply-skip"),"Apply complete and skip outcomes must share one deterministic command identity");
assert(apply.includes("commandCommitted(source,commandId)"),"Apply skip must tolerate a retried shared command against the fresh source snapshot");
assert(apply.includes("endStageWrite?.(guard.write)"),"Apply actions must release the shared stage-write lock after persistence");
assert(apply.includes("beginApplyWrite"),"Apply draft writes must serialize with terminal Apply completion instead of racing a full-data POST");

console.log("Stage Commands V3 checks passed.");