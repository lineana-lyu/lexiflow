const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"public","index.html"),"utf8").replace(/\r\n/g,"\n");
const guard=fs.readFileSync(path.join(root,"public","visualize-input-guard-v3.js"),"utf8").replace(/\r\n/g,"\n");

assert(index.includes('<script src="./visualize-input-guard-v3.js"></script>\n  <script src="./apply-input-guard-v3.js"></script>\n  <script src="./app.js"></script>'),"Visualize and Apply input guards must both load before the legacy app shell");
assert(guard.includes('if(input?.id!=="visual-note")return;'),"Visualize input guard must scope itself to visual-note only");
assert(guard.includes("event.stopImmediatePropagation();"),"Visualize note input must stop legacy/global input handlers from remounting the stage");
assert(guard.includes("setDraft(cardId,input.value);")&&guard.includes("function clearDraft(cardId)"),"Visualize input guard must retain the current draft through the shared draft authority and be able to clear stale residue");
assert(guard.includes("new MutationObserver(()=>queueMicrotask(restore))"),"Visualize input guard must restore an in-progress draft after an unrelated remount");
assert(guard.includes('const assist=root.querySelector?.(\'[data-visual-v3="assist"]\');'),"Visualize input guard must keep AI action state live without rerendering");
assert(guard.includes('const generate=root.querySelector?.(\'[data-visual-v3="generate"]\');'),"Visualize input guard must keep image generation state live without rerendering");

console.log("Visualize input isolation checks passed.");
