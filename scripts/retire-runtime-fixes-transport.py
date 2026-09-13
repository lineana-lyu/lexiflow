from pathlib import Path

# 1) Consolidate Chinese dictionary normalization into transport-fixes.js.
transport_path=Path("public/transport-fixes.js")
transport=transport_path.read_text(encoding="utf-8")
anchor='''    if (endpoint === "/api/search/smart" && body?.query && hasChinese(body.query)) {
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
    if transport.count(anchor)!=1:
        raise SystemExit(f"transport smart-search anchor count was {transport.count(anchor)}")
    transport=transport.replace(anchor,dictionary_block+anchor,1)
transport_path.write_text(transport,encoding="utf-8")

# 2) Remove runtime-fixes.js from the runtime script chain.
index_path=Path("public/index.html")
index=index_path.read_text(encoding="utf-8")
tag='''  <script src="./runtime-fixes.js"></script>\n'''
if tag in index:
    index=index.replace(tag,"",1)
index_path.write_text(index,encoding="utf-8")

# 3) Remove the retired runtime compatibility source.
runtime_path=Path("public/runtime-fixes.js")
if runtime_path.exists():
    runtime_path.unlink()

# 4) Remove obsolete syntax-check entry.
pkg_path=Path("package.json")
pkg=pkg_path.read_text(encoding="utf-8")
needle=''' && node --check public/runtime-fixes.js'''
if needle in pkg:
    pkg=pkg.replace(needle,"",1)
pkg_path.write_text(pkg,encoding="utf-8")

# 5) Update runtime cleanup contract: runtime-fixes.js is now retired, transport owns dictionary normalization.
cleanup_path=Path("scripts/check-runtime-cleanup-v3.js")
cleanup=cleanup_path.read_text(encoding="utf-8")
cleanup=cleanup.replace('''const runtime=fs.readFileSync(path.join(root,"public","runtime-fixes.js"),"utf8");\n''',"",1)
retired_anchor='''  "public/product-ux-v2.css",\n'''
if '  "public/runtime-fixes.js",\n' not in cleanup:
    if cleanup.count(retired_anchor)!=1:
        raise SystemExit("runtime cleanup retired-list anchor missing")
    cleanup=cleanup.replace(retired_anchor,retired_anchor+'  "public/runtime-fixes.js",\n',1)
old_block='''assert(runtime.includes("transport-only"),"runtime compatibility must stay transport-only");
assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must stay free of retired Stage AI blocking/caller knowledge");
assert(!runtime.includes("MutationObserver"),"runtime compatibility must not decorate stage DOM through a global observer");
assert(!runtime.includes("visual-image-canvas")&&!runtime.includes("scene-panel.is-loading"),"legacy Visualize DOM selectors must stay out of runtime compatibility");
assert(!runtime.includes("background-generation-note"),"V3 Visualize renderer must be the only owner of image-generation progress UI");
'''
new_block='''assert(!index.includes('<script src="./runtime-fixes.js"></script>'),"retired runtime compatibility wrapper must not load");
assert(!fs.existsSync(path.join(root,"public","runtime-fixes.js")),"retired runtime compatibility source must stay deleted");
assert(transport.includes('endpoint === "/api/dictionary/lookup"'),"transport must own active dictionary response normalization after runtime compatibility retirement");
assert(transport.includes("normalizeSmartSearch(data, body.word)"),"dictionary lookup normalization must reuse the canonical Chinese lookup normalizer");
assert(!transport.includes("LEGACY_STAGE_AI_BLOCKED")&&!transport.includes("/api/ai/visual-scene")&&!transport.includes("/api/ai/practice-prompt"),"transport must stay free of retired Stage AI endpoint knowledge");
'''
if old_block in cleanup:
    cleanup=cleanup.replace(old_block,new_block,1)
elif "retired runtime compatibility wrapper must not load" not in cleanup:
    raise SystemExit("runtime cleanup compatibility assertion block not found")
cleanup_path.write_text(cleanup,encoding="utf-8")

# 6) Update AI authority contract: runtime compatibility is gone; transport precedes AI Assist but must not own Stage AI.
ai_check_path=Path("scripts/check-ai-assist-v3.js")
ai_check=ai_check_path.read_text(encoding="utf-8")
ai_check=ai_check.replace('''const runtime=read("public/runtime-fixes.js");\n''',"",1)
if 'const transport=read("public/transport-fixes.js");' not in ai_check:
    ai_check=ai_check.replace('''const ai=read("public/ai-assist-v3.js");\n''','''const ai=read("public/ai-assist-v3.js");\nconst transport=read("public/transport-fixes.js");\n''',1)
if 'const exists=name=>fs.existsSync(path.join(root,name));' not in ai_check:
    ai_check=ai_check.replace('''const read=name=>fs.readFileSync(path.join(root,name),"utf8");\n''','''const read=name=>fs.readFileSync(path.join(root,name),"utf8");\nconst exists=name=>fs.existsSync(path.join(root,name));\n''',1)
old_order='''const transportIndex=index.indexOf("transport-fixes.js");
const aiIndex=index.indexOf("ai-assist-v3.js");
const runtimeIndex=index.indexOf("runtime-fixes.js");
assert(transportIndex>=0&&aiIndex>=0&&runtimeIndex>=0,"transport, AI authority, and runtime compatibility scripts must all load");
assert(transportIndex<aiIndex&&aiIndex<runtimeIndex,"AI Assist V3 must capture upstream transport before the runtime compatibility wrapper is installed");
'''
new_order='''const transportIndex=index.indexOf("transport-fixes.js");
const aiIndex=index.indexOf("ai-assist-v3.js");
assert(transportIndex>=0&&aiIndex>=0,"transport and AI authority scripts must load");
assert(transportIndex<aiIndex,"AI Assist V3 must capture the canonical transport layer");
assert(!index.includes("runtime-fixes.js")&&!exists("public/runtime-fixes.js"),"retired runtime compatibility wrapper must stay absent");
'''
if old_order in ai_check:
    ai_check=ai_check.replace(old_order,new_order,1)
elif "retired runtime compatibility wrapper must stay absent" not in ai_check:
    raise SystemExit("AI Assist load-order block not found")
old_runtime='''assert(!runtime.includes("LEGACY_STAGE_AI_BLOCKED")&&!runtime.includes("blockedLegacyStageAi"),"runtime compatibility must not retain the retired legacy Stage AI firewall after source callers are gone");
assert(!runtime.includes("/api/ai/visual-scene")&&!runtime.includes("/api/ai/practice-prompt"),"runtime compatibility must not know Stage AI endpoints; AI Assist V3 owns them exclusively");
assert(runtime.includes('/api/dictionary/lookup')&&runtime.includes("normalizeChineseLookup"),"runtime compatibility must remain scoped to the active dictionary response normalization");
assert(!runtime.includes("stableInternalVisualScene")&&!runtime.includes("robustManualVisualScene")&&!runtime.includes("robustPracticePrompt"),"runtime compatibility must not own Stage AI generation logic");
assert(!runtime.includes("manualSceneRefreshUntil")&&!runtime.includes("SCENE_HISTORY_KEY")&&!runtime.includes("PROMPT_HISTORY_KEY"),"Stage AI intent/history must stay outside the global runtime shim");
'''
new_runtime='''assert(transport.includes('/api/dictionary/lookup')&&transport.includes("normalizeSmartSearch(data, body.word)"),"canonical transport must preserve Chinese dictionary response normalization after runtime compatibility retirement");
assert(!transport.includes("/api/ai/visual-scene")&&!transport.includes("/api/ai/practice-prompt"),"transport must not know Stage AI endpoints; AI Assist V3 owns them exclusively");
'''
if old_runtime in ai_check:
    ai_check=ai_check.replace(old_runtime,new_runtime,1)
elif "canonical transport must preserve Chinese dictionary response normalization" not in ai_check:
    raise SystemExit("AI Assist runtime-compatibility assertion block not found")
ai_check_path.write_text(ai_check,encoding="utf-8")

# Final migration invariants.
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
