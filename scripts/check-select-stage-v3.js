const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const intake=read("public/select-intake-v3.js");
const app=read("public/app.js");
const transition=read("public/stage-transition-v3.js");

new vm.Script(intake,{filename:"select-intake-v3.js"});

assert(index.includes('<script src="./select-intake-v3.js"></script>'),"Select Intake V3 must be active in index.html");
assert(!index.includes("select-stage-v3.js"),"the duplicate Select confirmation renderer must not be loaded at runtime");
assert(!exists("public/select-stage-v3.js"),"the obsolete duplicate Select confirmation renderer must stay physically deleted");

assert(intake.includes("选择明天要学的新词"),"Today must own selection of already-created new-word cards");
assert(intake.includes("不再重复确认词义"),"Today selection must not introduce a second sense-confirmation step");
assert(intake.includes('card.stage="memorize"'),"choosing an existing card must complete Select immediately");
assert(intake.includes('core.crossDayPatch(prev,{stage:"memorize",learningStage:"memorize"},now)'),"completed Select must schedule Memorize cross-day instead of learning the word today");
assert(intake.includes('data-select-intake-confirm="1"'),"Today must provide one batch confirmation for selected cards");
assert(intake.includes('data-tp-add-today="1"'),"when no suitable pending card exists, Today must hand off to card creation directly");
assert(intake.includes("repairLegacySelectedCards"),"old selected-but-unconfirmed cards must auto-migrate without showing the removed confirmation stage");

assert(app.includes('card.stage="memorize"')&&app.includes('core?.crossDayPatch?.(prev,{stage:"memorize",learningStage:"memorize"},nowDate)'),"a card created from Today must complete Select immediately and become tomorrow Memorize work");
assert(app.includes('toast(addToToday?"已加入今天的新词 · 明天开始记忆"'),"card creation from Today must clearly preserve the tomorrow-learning rule");

assert(intake.includes('data-action="speak"')&&intake.includes('data-audio="${esc(card.audioUrl||"")}"'),"Today selection cards must reuse the card pronunciation payload");
assert(app.includes("LexiFlowPronunciationV3=Object.freeze"),"all word and sentence playback surfaces must share the pronunciation bridge");
assert(app.includes('data-action="speak-sentence"'),"card creation/reference examples must expose sentence playback");
assert(app.includes("playSentence(sentence){return speakSentence(sentence);}"),"example playback must use the shared sentence pronunciation path");

assert(transition.includes('card.stage="memorize"')&&!transition.includes('card.stage="memorize1"'),"legacy authoritative Select transition compatibility must still persist canonical Memorize");
assert(transition.includes('stageTransitionAuthority:"v3"'),"legacy transition writes must remain explicitly attributable while old persisted state is repaired");

console.log("Direct Select intake checks passed.");
