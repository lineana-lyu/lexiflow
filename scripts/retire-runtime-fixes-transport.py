from pathlib import Path

# Consolidate Chinese dictionary normalization into transport-fixes.js.
transport_path=Path("public/transport-fixes.js")
transport=transport_path.read_text(encoding="utf-8")
smart_block='''    if (endpoint === "/api/search/smart" && body?.query && hasChinese(body.query)) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        return jsonResponse(response.status, normalizeSmartSearch(data, body.query), response);
      } catch {
        return response;
      }
    }
'''
dictionary_block='''    if (endpoint === "/api/dictionary/lookup" && body?.word && hasChinese(body.word)) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        return jsonResponse(response.status, normalizeSmartSearch(data, body.word), response);
      } catch {
        return response;
      }
    }

'''
if dictionary_block not in transport:
    if transport.count(smart_block)!=1:
        raise SystemExit(f"transport smart-search anchor count was {transport.count(smart_block)}")
    transport=transport.replace(smart_block,dictionary_block+smart_block,1)
transport_path.write_text(transport,encoding="utf-8")

# Remove runtime-fixes.js from runtime and syntax checks.
index_path=Path("public/index.html")
index=index_path.read_text(encoding="utf-8")
index=index.replace('  <script src="./runtime-fixes.js"></script>\n',"",1)
index_path.write_text(index,encoding="utf-8")

runtime_path=Path("public/runtime-fixes.js")
if runtime_path.exists(): runtime_path.unlink()

pkg_path=Path("package.json")
pkg=pkg_path.read_text(encoding="utf-8").replace(" && node --check public/runtime-fixes.js","",1)
pkg_path.write_text(pkg,encoding="utf-8")

# Runtime cleanup contract: runtime compatibility is retired; transport owns dictionary normalization.
cleanup_path=Path("scripts/check-runtime-cleanup-v3.js")
cleanup=cleanup_path.read_text(encoding="utf-8")
cleanup=cleanup.replace('const runtime=fs.readFileSync(path.join(root,"public","runtime-fixes.js"),"utf8");\n',"",1)
if '  "public/runtime-fixes.js",\n' not in cleanup:
    cleanup=cleanup.replace('  "public/product-ux-v2.css",\n','  "public/product-ux-v2.css",\n  "public/runtime-fixes.js",\n',1)
old='''assert(runtime.includes("transport-only"),"runtime compatibility must stay transport-only");
assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must stay free of retired Stage AI blocking/caller knowledge");
assert(!runtime.includes("MutationObserver"),"runtime compatibility must not decorate stage DOM through a global observer");
assert(!runtime.includes("visual-image-canvas")&&!runtime.includes("scene-panel.is-loading"),"legacy Visualize DOM selectors must stay out of runtime compatibility");
assert(!runtime.includes("background-generation-note"),"V3 Visualize renderer must be the only owner of image-generation progress UI");
'''
new='''assert(!index.includes('<script src="./runtime-fixes.js"></script>'),"retired runtime compatibility wrapper must not load");
assert(!fs.existsSync(path.join(root,"public","runtime-fixes.js")),"retired runtime compatibility source must stay deleted");
assert(transport.includes('endpoint === "/api/dictionary/lookup"'),"transport must own active dictionary response normalization after runtime compatibility retirement");
assert(transport.includes("normalizeSmartSearch(data, body.word)"),"dictionary lookup normalization must reuse the canonical Chinese lookup normalizer");
assert(!transport.includes("LEGACY_STAGE_AI_BLOCKED")&&!transport.includes("/api/ai/visual-scene")&&!transport.includes("/api/ai/practice-prompt"),"transport must stay free of retired Stage AI endpoint knowledge");
'''
if old in cleanup:
    cleanup=cleanup.replace(old,new,1)
elif "retired runtime compatibility wrapper must not load" not in cleanup:
    raise SystemExit("runtime cleanup assertion block not found")
cleanup_path.write_text(cleanup,encoding="utf-8")

# AI Assist contract: transport loads first; no runtime compatibility wrapper remains.
ai_path=Path("scripts/check-ai-assist-v3.js")
ai=ai_path.read_text(encoding="utf-8")
ai=ai.replace('const runtime=read("public/runtime-fixes.js");\n',"",1)
if 'const transport=read("public/transport-fixes.js");' not in ai:
    ai=ai.replace('const ai=read("public/ai-assist-v3.js");\n','const ai=read("public/ai-assist-v3.js");\nconst transport=read("public/transport-fixes.js");\n',1)
if 'const exists=name=>fs.existsSync(path.join(root,name));' not in ai:
    ai=ai.replace('const read=name=>fs.readFileSync(path.join(root,name),"utf8");\n','const read=name=>fs.readFileSync(path.join(root,name),"utf8");\nconst exists=name=>fs.existsSync(path.join(root,name));\n',1)
old='''const transportIndex=index.indexOf("transport-fixes.js");
const aiIndex=index.indexOf("ai-assist-v3.js");
const runtimeIndex=index.indexOf("runtime-fixes.js");
assert(transportIndex>=0&&aiIndex>=0&&runtimeIndex>=0,"transport, AI authority, and runtime compatibility scripts must all load");
assert(transportIndex<aiIndex&&aiIndex<runtimeIndex,"AI Assist V3 must capture upstream transport before the runtime compatibility wrapper is installed");
'''
new='''const transportIndex=index.indexOf("transport-fixes.js");
const aiIndex=index.indexOf("ai-assist-v3.js");
assert(transportIndex>=0&&aiIndex>=0,"transport and AI authority scripts must load");
assert(transportIndex<aiIndex,"AI Assist V3 must capture the canonical transport layer");
assert(!index.includes("runtime-fixes.js")&&!exists("public/runtime-fixes.js"),"retired runtime compatibility wrapper must stay absent");
'''
if old in ai: ai=ai.replace(old,new,1)
old='''assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("blockedLegacyStageAi"),"runtime compatibility must not retain the retired legacy Stage AI firewall after source callers are gone");
assert(!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must not know Stage AI endpoints; AI Assist V3 owns them exclusively");
assert(runtime.includes('/api/dictionary/lookup')&&runtime.includes("normalizeChineseLookup"),"runtime compatibility must remain scoped to the active dictionary response normalization");
assert(!runtime.includes("stableInternalVisualScene")&&!runtime.includes("robustManualVisualScene")&&!runtime.includes("robustPracticePrompt"),"runtime compatibility must not own Stage AI generation logic");
assert(!runtime.includes("manualSceneRefreshUntil")&&!runtime.includes("SCENE_HISTORY_KEY")&&!runtime.includes("PROMPT_HISTORY_KEY"),"Stage AI intent/history must stay outside the global runtime shim");
'''
new='''assert(transport.includes('/api/dictionary/lookup')&&transport.includes("normalizeSmartSearch(data, body.word)"),"canonical transport must preserve Chinese dictionary response normalization after runtime compatibility retirement");
assert(!transport.includes("/api/ai/visual-scene")&&!transport.includes("/api/ai/practice-prompt"),"transport must not know Stage AI endpoints; AI Assist V3 owns them exclusively");
'''
if old in ai: ai=ai.replace(old,new,1)
if "retired runtime compatibility wrapper must stay absent" not in ai or "canonical transport must preserve Chinese dictionary response normalization" not in ai:
    raise SystemExit("AI Assist runtime migration did not apply")
ai_path.write_text(ai,encoding="utf-8")

# Stage Renderer contract: remove the obsolete runtime firewall relationship.
stage_path=Path("scripts/check-stage-renderers-v3.js")
stage=stage_path.read_text(encoding="utf-8")
stage=stage.replace('const runtime=read("public/runtime-fixes.js");\n',"",1)
if 'const transport=read("public/transport-fixes.js");' not in stage:
    stage=stage.replace('const ai=read("public/ai-assist-v3.js");\n','const ai=read("public/ai-assist-v3.js");\nconst transport=read("public/transport-fixes.js");\n',1)
stage=stage.replace('before("ai-assist-v3.js","runtime-fixes.js");\n',"",1)
old='''assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must not retain retired Stage AI caller/block knowledge once AI Assist V3 is the sole frontend authority");
assert(!runtime.includes("LexiFlowAiAssistV3?.visualScene"),"legacy Visualize auto-call paths must not delegate into AI Assist V3");
assert(!runtime.includes("stableInternalVisualScene"),"Visualize V3 must never fall back to a synthetic echo");
'''
new='''assert(!transport.includes("/api/ai/visual-scene")&&!transport.includes("/api/ai/practice-prompt"),"transport must not own Stage AI endpoints once AI Assist V3 is the sole frontend authority");
'''
if old in stage: stage=stage.replace(old,new,1)
stage=stage.replace('assert(!runtime.includes("LexiFlowAiAssistV3?.practicePrompt"),"legacy Apply auto-prompt paths must not delegate into AI Assist V3");\n',"",1)
if "runtime-fixes.js" in stage or "runtime.includes" in stage:
    raise SystemExit("stage renderer contract still depends on runtime-fixes.js")
stage_path.write_text(stage,encoding="utf-8")

# Final invariants: no check contract may require runtime-fixes.js.
assert not runtime_path.exists()
assert "runtime-fixes.js" not in index_path.read_text(encoding="utf-8")
assert "node --check public/runtime-fixes.js" not in pkg_path.read_text(encoding="utf-8")
transport=transport_path.read_text(encoding="utf-8")
assert 'endpoint === "/api/dictionary/lookup"' in transport
assert "normalizeSmartSearch(data, body.word)" in transport
for path in Path("scripts").glob("check-*.js"):
    text=path.read_text(encoding="utf-8")
    if "runtime-fixes.js" in text and path.name not in {"check-runtime-cleanup-v3.js","check-ai-assist-v3.js"}:
        raise SystemExit(f"unexpected runtime-fixes.js contract remains in {path}")
