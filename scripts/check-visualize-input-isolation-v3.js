const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const source=fs.readFileSync(path.join(__dirname,"..","public","visualize-stage-v3.js"),"utf8").replace(/\r\n/g,"\n");

assert(source.includes('if(event.target?.id!=="visual-note")return;'),"Visualize V3 must own the visual-note input");
assert(source.includes('event.stopImmediatePropagation();\n    const card=currentCard();'),"Visualize note input must stop legacy/global input handlers from remounting the stage");
assert(source.includes('setDraft(card.id,event.target.value);'),"Visualize note input must preserve its local draft");
assert(source.includes('if(assist)assist.disabled=empty||interactionBusy;'),"Visualize note input must keep AI action state live without rerendering");
assert(source.includes('if(generateButton)generateButton.disabled=empty||interactionBusy;'),"Visualize note input must keep generate action state live without rerendering");

console.log("Visualize input isolation checks passed.");
