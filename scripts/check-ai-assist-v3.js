const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const ai=read("public/ai-assist-v3.js");
const runtime=read("public/runtime-fixes.js");
const visual=read("public/visualize-stage-v3.js");
const apply=read("public/apply-stage-v3.js");

const transportIndex=index.indexOf("transport-fixes.js");
const aiIndex=index.indexOf("ai-assist-v3.js");
const runtimeIndex=index.indexOf("runtime-fixes.js");
assert(transportIndex>=0&&aiIndex>=0&&runtimeIndex>=0,"transport, AI authority, and runtime compatibility scripts must all load");
assert(transportIndex<aiIndex&&aiIndex<runtimeIndex,"AI Assist V3 must capture upstream transport before the runtime compatibility wrapper is installed");

assert(ai.includes("window.LexiFlowAiAssistV3=Object.freeze"),"AI Assist V3 must expose a narrow explicit authority");
assert(ai.includes('postJson("/api/ai/visual-scene"'),"AI Assist V3 must own Visualize scene requests");
assert(ai.includes('postJson("/api/ai/practice-prompt"'),"AI Assist V3 must own Apply practice-prompt requests");
assert(ai.includes("for(let attempt=0;attempt<3;attempt++)"),"AI Assist V3 must retry weak scene/prompt candidates without relying on a transport shim");
assert(ai.includes("sceneNeedsCleanup"),"AI Assist V3 must keep visual-scene text safety cleanup close to the AI authority");
assert(ai.includes("tooSimilar"),"AI Assist V3 must prevent repeated scene/prompt candidates");

assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("blockedLegacyStageAi"),"runtime compatibility must not retain the retired legacy Stage AI firewall after source callers are gone");
assert(!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must not know Stage AI endpoints; AI Assist V3 owns them exclusively");
assert(runtime.includes('/api/dictionary/lookup')&&runtime.includes("normalizeChineseLookup"),"runtime compatibility must remain scoped to the active dictionary response normalization");
assert(!runtime.includes("stableInternalVisualScene")&&!runtime.includes("robustManualVisualScene")&&!runtime.includes("robustPracticePrompt"),"runtime compatibility must not own Stage AI generation logic");
assert(!runtime.includes("manualSceneRefreshUntil")&&!runtime.includes("SCENE_HISTORY_KEY")&&!runtime.includes("PROMPT_HISTORY_KEY"),"Stage AI intent/history must stay outside the global runtime shim");

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