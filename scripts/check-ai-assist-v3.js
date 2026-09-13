const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const exists=name=>fs.existsSync(path.join(root,name));

const index=read("public/index.html");
const ai=read("public/ai-assist-v3.js");
const transport=read("public/transport-fixes.js");
const visual=read("public/visualize-stage-v3.js");
const apply=read("public/apply-stage-v3.js");

const transportIndex=index.indexOf("transport-fixes.js");
const aiIndex=index.indexOf("ai-assist-v3.js");
assert(transportIndex>=0&&aiIndex>=0,"transport and AI authority scripts must load");
assert(transportIndex<aiIndex,"AI Assist V3 must capture the canonical transport layer");
assert(!index.includes("runtime-fixes.js")&&!exists("public/runtime-fixes.js"),"retired runtime compatibility wrapper must stay absent");

assert(ai.includes("window.LexiFlowAiAssistV3=Object.freeze"),"AI Assist V3 must expose a narrow explicit authority");
assert(ai.includes('postJson("/api/ai/visual-scene"'),"AI Assist V3 must own Visualize scene requests");
assert(ai.includes('postJson("/api/ai/practice-prompt"'),"AI Assist V3 must own Apply practice-prompt requests");
assert(ai.includes("for(let attempt=0;attempt<3;attempt++)"),"AI Assist V3 must retry weak scene/prompt candidates without relying on a transport shim");
assert(ai.includes("sceneNeedsCleanup"),"AI Assist V3 must keep visual-scene text safety cleanup close to the AI authority");
assert(ai.includes("tooSimilar"),"AI Assist V3 must prevent repeated scene/prompt candidates");

assert(transport.includes('/api/dictionary/lookup')&&transport.includes("normalizeSmartSearch(data, body.word)"),"canonical transport must preserve Chinese dictionary response normalization after runtime compatibility retirement");
assert(!transport.includes("/api/ai/visual-scene")&&!transport.includes("/api/ai/practice-prompt"),"transport must not know Stage AI endpoints; AI Assist V3 owns them exclusively");

const publicJs=fs.readdirSync(path.join(root,"public")).filter(name=>name.endsWith(".js"));
for(const endpoint of ["/api/ai/visual-scene","/api/ai/practice-prompt"]){
  const owners=publicJs.filter(name=>read(`public/${name}`).includes(endpoint));
  assert(owners.length===1&&owners[0]==="ai-assist-v3.js",`${endpoint} must have exactly one frontend owner: ai-assist-v3.js; found ${owners.join(", ")||"none"}`);
}
const appShell=read("public/app.js");
for(const retiredCaller of ["ensureVisualSceneSuggestion","ensurePracticePrompt"]){
  assert(!appShell.includes(retiredCaller),`retired app.js Stage AI caller must stay deleted: ${retiredCaller}`);
}

assert(visual.includes("LexiFlowAiAssistV3?.visualScene"),"Visualize V3 must call the explicit AI Assist authority directly");
assert(!visual.includes('fetch("/api/ai/visual-scene"'),"Visualize V3 must not route its primary AI assist through the global fetch compatibility chain");
assert(apply.includes("LexiFlowAiAssistV3?.practicePrompt"),"Apply V3 must call the explicit AI Assist authority directly for prompt refresh");
assert(!apply.includes('fetch("/api/ai/practice-prompt"'),"Apply V3 must not route prompt refresh through the global fetch compatibility chain");

console.log("AI Assist V3 authority checks passed.");