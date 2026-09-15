const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}

const root=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(root,"server.js"),"utf8").replace(/\r\n/g,"\n");
const visual=fs.readFileSync(path.join(root,"public","visualize-stage-v3.js"),"utf8").replace(/\r\n/g,"\n");

assert(
  server.includes('runCodexFastText(prompt,{timeoutMs:30000,reasoningEffortOverride:"low"})'),
  "Visualize scene assist must allow enough time for Codex on desktop"
);
assert(visual.includes('let assistError="";'),"Visualize scene assist must keep visible error state");
assert(visual.includes('err?.payload?.userError?.message'),"Visualize scene assist must surface backend-friendly errors");
assert(visual.includes('${assistError?'),"Visualize scene assist must render the error inside the stage");

console.log("Visual assist resilience checks passed.");
