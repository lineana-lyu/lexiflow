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

assert(runtime.includes("LEGACY_STAGE_AI_BLOCKED"),"runtime compatibility must fail closed dormant legacy stage-AI requests");
assert(runtime.includes('endpoint==="/api/ai/visual-scene"||endpoint==="/api/ai/practice-prompt"'),"runtime compatibility must block both retired stage-AI request paths");
assert(runtime.includes("只能由当前 V3 学习页面上的明确操作发起"),"legacy stage-AI block must explain that only explicit V3 learner action may invoke AI");
assert(!runtime.includes("LexiFlowAiAssistV3?.visualScene"),"runtime compatibility must not delegate dormant legacy Visualize auto-calls into real AI");
assert(!runtime.includes("LexiFlowAiAssistV3?.practicePrompt"),"runtime compatibility must not delegate dormant legacy Apply auto-calls into real AI");
assert(!runtime.includes("stableInternalVisualScene"),"runtime compatibility must not synthesize fake Visualize AI results");
assert(!runtime.includes("robustManualVisualScene"),"runtime compatibility must not own Visualize AI generation logic");
assert(!runtime.includes("robustPracticePrompt"),"runtime compatibility must not own Apply prompt generation logic");
assert(!runtime.includes("manualSceneRefreshUntil"),"runtime compatibility must not infer AI intent from click timing");
assert(!runtime.includes("SCENE_HISTORY_KEY"),"scene history must live with AI Assist V3 instead of the global runtime shim");
assert(!runtime.includes("PROMPT_HISTORY_KEY"),"prompt history must live with AI Assist V3 instead of the global runtime shim");

assert(visual.includes("LexiFlowAiAssistV3?.visualScene"),"Visualize V3 must call the explicit AI Assist authority directly");
assert(!visual.includes('fetch("/api/ai/visual-scene"'),"Visualize V3 must not route its primary AI assist through the global fetch compatibility chain");
assert(apply.includes("LexiFlowAiAssistV3?.practicePrompt"),"Apply V3 must call the explicit AI Assist authority directly for prompt refresh");
assert(!apply.includes('fetch("/api/ai/practice-prompt"'),"Apply V3 must not route prompt refresh through the global fetch compatibility chain");

console.log("AI Assist V3 authority checks passed.");