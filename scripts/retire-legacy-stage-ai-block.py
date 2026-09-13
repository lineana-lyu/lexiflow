from pathlib import Path

runtime_path=Path("public/runtime-fixes.js")
runtime=runtime_path.read_text(encoding="utf-8")
old_synthetic='''  function syntheticJson(data,status=200){
    return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }
'''
if runtime.count(old_synthetic)!=1:
    raise SystemExit(f"syntheticJson block count was {runtime.count(old_synthetic)}")
runtime=runtime.replace(old_synthetic,"",1)
start='''  function blockedLegacyStageAi(endpoint){'''
comment='''  // This compatibility layer is transport-only. V3 stage renderers own all
  // loading, warning, progress, and AI-assist UI. Dormant legacy app.js stage
  // callers are deliberately failed closed so merely rendering an old stage body
  // can never spend an AI request or create a first association for the learner.
'''
if runtime.count(start)!=1 or runtime.count(comment)!=1:
    raise SystemExit("legacy Stage AI block/comment anchors are not unique")
a=runtime.index(start)
b=runtime.index(comment,a)
runtime=runtime[:a]+'''  // This compatibility layer is transport-only. Stage AI requests are owned
  // exclusively by AI Assist V3; this wrapper now only normalizes Chinese
  // dictionary lookup responses for the base app.
'''+runtime[b+len(comment):]
old_branch='''    if((endpoint==="/api/ai/visual-scene"||endpoint==="/api/ai/practice-prompt")&&body){
      return blockedLegacyStageAi(endpoint);
    }

'''
if runtime.count(old_branch)!=1:
    raise SystemExit(f"legacy Stage AI fetch branch count was {runtime.count(old_branch)}")
runtime=runtime.replace(old_branch,"",1)
for retired in ["LEGACY_STAGE_AI_BLOCKED","blockedLegacyStageAi","syntheticJson","/api/ai/visual-scene","/api/ai/practice-prompt","旧学习流程已停用"]:
    if retired in runtime:
        raise SystemExit(f"retired Stage AI runtime block remains: {retired}")
if '/api/dictionary/lookup' not in runtime or 'normalizeChineseLookup' not in runtime or 'transport-only' not in runtime:
    raise SystemExit("active dictionary compatibility behavior was lost")
runtime_path.write_text(runtime,encoding="utf-8")

check_path=Path("scripts/check-ai-assist-v3.js")
check=check_path.read_text(encoding="utf-8")
old='''assert(runtime.includes("LEGACY_STAGE_AI_BLOCKED"),"runtime compatibility must fail closed dormant legacy stage-AI requests");
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
'''
new='''assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("blockedLegacyStageAi"),"runtime compatibility must not retain the retired legacy Stage AI firewall after source callers are gone");
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
'''
if check.count(old)!=1:
    raise SystemExit(f"legacy AI block assertion group count was {check.count(old)}")
check=check.replace(old,new,1)
check_path.write_text(check,encoding="utf-8")

cleanup_path=Path("scripts/check-runtime-cleanup-v3.js")
cleanup=cleanup_path.read_text(encoding="utf-8")
anchor='assert(runtime.includes("transport-only"),"runtime compatibility must stay transport-only");'
addition='''\nassert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must stay free of retired Stage AI blocking/caller knowledge");'''
if cleanup.count(anchor)!=1:
    raise SystemExit("runtime cleanup transport-only anchor not unique")
if "must stay free of retired Stage AI blocking/caller knowledge" not in cleanup:
    cleanup=cleanup.replace(anchor,anchor+addition,1)
cleanup_path.write_text(cleanup,encoding="utf-8")
