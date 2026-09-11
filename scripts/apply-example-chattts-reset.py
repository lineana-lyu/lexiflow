from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, before: str, after: str):
    text = path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {before[:120]!r}")
    path.write_text(text.replace(before, after, 1), encoding="utf-8")


server = ROOT / "server-runtime.js"
replace_once(
    server,
    'const exampleEnrichment = require("./lib/example-enrichment");',
    'const exampleEnrichment = require("./lib/example-enrichment");\nconst chattts = require("./lib/chattts");',
)

replace_once(
    server,
    '''      meaningZh: clean(sense?.meaningZh),\n      senseIntentEn: clean(sense?.senseIntentEn),\n    }))''',
    '''      meaningZh: clean(sense?.meaningZh),\n      senseIntentEn: clean(sense?.senseIntentEn),\n      exampleEn: clean(sense?.exampleEn),\n      exampleZh: clean(sense?.exampleZh),\n    }))''',
)

old_pipeline = '''  const warnings = [];\n  const cached = await exampleEnrichment.getCachedExamples(word, senses);\n  let combined = mergeExamples(cached);\n  const missingAfterCache = senses.filter(sense => !combined.some(item => item.id === sense.id));\n\n  let dictionaryExamples = [];\n  if (missingAfterCache.length) {\n    dictionaryExamples = await tryDictionaryExamples(word, missingAfterCache);\n    if (dictionaryExamples.length) {\n      await exampleEnrichment.storeExamples(word, missingAfterCache, dictionaryExamples).catch(() => {});\n      combined = mergeExamples(combined, dictionaryExamples);\n    }\n  }\n\n  const missingAfterDictionary = senses.filter(sense => !combined.some(item => item.id === sense.id));\n  if (missingAfterDictionary.length) {\n    try {\n      const generated = await exampleEnrichment.generateExamples(word, missingAfterDictionary);\n      if (generated.length) {\n        await exampleEnrichment.storeExamples(word, missingAfterDictionary, generated).catch(() => {});\n        combined = mergeExamples(combined, generated);\n      }\n    } catch (err) {\n      warnings.push(clean(err?.code) || "EXAMPLE_AI_UNAVAILABLE");\n      console.warn("example enrichment failed:", err?.message || err);\n    }\n  }\n'''
new_pipeline = '''  const warnings = [];\n  const supplied = senses\n    .filter(sense => sense.exampleEn && sense.exampleZh)\n    .map(sense => ({ id: sense.id, exampleEn: sense.exampleEn, exampleZh: sense.exampleZh, source: "local-dictionary", cacheHit: false }));\n  const cached = await exampleEnrichment.getCachedExamples(word, senses);\n  let combined = mergeExamples(supplied, cached);\n\n  // If a dictionary already supplied the English example, preserve it exactly.\n  // AI is only allowed to translate the missing Chinese text; it must not rewrite\n  // or replace the source example.\n  const translationOnly = senses.filter(sense =>\n    sense.exampleEn && !sense.exampleZh && !combined.some(item => item.id === sense.id)\n  );\n  if (translationOnly.length) {\n    try {\n      const translated = await exampleEnrichment.translateExamples(word, translationOnly);\n      if (translated.length) {\n        await exampleEnrichment.storeExamples(word, translationOnly, translated).catch(() => {});\n        combined = mergeExamples(combined, translated);\n      }\n    } catch (err) {\n      warnings.push(clean(err?.code) || "EXAMPLE_TRANSLATION_UNAVAILABLE");\n      console.warn("example translation failed:", err?.message || err);\n    }\n  }\n\n  // Only senses that genuinely have no English example may ask another dictionary\n  // or AI to supply one. This avoids replacing a perfectly good local example.\n  const missingEnglish = senses.filter(sense =>\n    !sense.exampleEn && !combined.some(item => item.id === sense.id)\n  );\n  let dictionaryExamples = [];\n  if (missingEnglish.length) {\n    dictionaryExamples = await tryDictionaryExamples(word, missingEnglish);\n    if (dictionaryExamples.length) {\n      await exampleEnrichment.storeExamples(word, missingEnglish, dictionaryExamples).catch(() => {});\n      combined = mergeExamples(combined, dictionaryExamples);\n    }\n  }\n\n  const stillMissingEnglish = missingEnglish.filter(sense => !combined.some(item => item.id === sense.id));\n  if (stillMissingEnglish.length) {\n    try {\n      const generated = await exampleEnrichment.generateExamples(word, stillMissingEnglish);\n      if (generated.length) {\n        await exampleEnrichment.storeExamples(word, stillMissingEnglish, generated).catch(() => {});\n        combined = mergeExamples(combined, generated);\n      }\n    } catch (err) {\n      warnings.push(clean(err?.code) || "EXAMPLE_AI_UNAVAILABLE");\n      console.warn("example enrichment failed:", err?.message || err);\n    }\n  }\n'''
replace_once(server, old_pipeline, new_pipeline)

insert_before_forward = '''async function handleChatTts(res, body) {\n  let parsed;\n  try {\n    parsed = parseJsonBuffer(body);\n  } catch {\n    return writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });\n  }\n  const text = clean(parsed.text).slice(0, 500);\n  if (!text) return writeJson(res, 400, { ok: false, code: "TTS_EMPTY", error: "没有可朗读的内容" });\n  try {\n    const audio = await chattts.synthesize(text);\n    return writeJson(res, 200, { ok: true, audioDataUrl: audio.dataUrl, cacheHit: audio.cacheHit, voice: audio.voice });\n  } catch (err) {\n    console.warn("ChatTTS unavailable:", err?.message || err);\n    return writeJson(res, 503, {\n      ok: false,\n      code: err?.code || "CHATTTS_UNAVAILABLE",\n      error: "自定义语音当前不可用",\n      userError: {\n        title: "自定义语音没有启动",\n        message: "请使用安装了 ChatTTS、PyTorch、NumPy 和 SciPy 的 Python 环境，并可通过 LEXIFLOW_PYTHON 指定 python.exe。"\n      }\n    });\n  }\n}\n\n'''
replace_once(server, 'function forward(req, res, body = null) {', insert_before_forward + 'function forward(req, res, body = null) {')

route_anchor = '''    if (req.method === "POST" && url.pathname === "/api/dictionary/examples") {\n      try {\n        const body = await readBody(req);\n        return await handleExampleHydration(req, res, body);\n      } catch (err) {\n        console.error("example hydration request failed:", err?.message || err);\n        return writeJson(res, 500, { ok: false, code: "EXAMPLE_HYDRATION_FAILED", error: "例句暂时没有准备完成" });\n      }\n    }\n\n'''
route_replacement = route_anchor + '''    if (req.method === "POST" && url.pathname === "/api/tts/chattts") {\n      try {\n        const body = await readBody(req, 64 * 1024);\n        return await handleChatTts(res, body);\n      } catch (err) {\n        return writeJson(res, 500, { ok: false, code: err?.code || "CHATTTS_FAILED", error: "自定义语音没有完成" });\n      }\n    }\n\n'''
replace_once(server, route_anchor, route_replacement)
replace_once(server, 'function stopServer() {\n  coreLexicon.close();', 'function stopServer() {\n  chattts.stop();\n  coreLexicon.close();')

app = ROOT / "public" / "app.js"
replace_once(
    app,
    '''      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()||!s.exampleZh?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和中英文例句");render();return;}''',
    '''      if(!s.meaningZh?.trim()||!s.exampleEn?.trim()){state.addDraft=JSON.parse(JSON.stringify(s));toast("保存前请补全中文释义和英文例句");render();return;}''',
)
replace_once(
    app,
    '''exampleEn:s.exampleEn,exampleZh:s.exampleZh,senseIntentEn:''',
    '''exampleEn:s.exampleEn,exampleZh:s.exampleZh||"",exampleTranslationPending:!s.exampleZh?.trim(),senseIntentEn:''',
)

listener = '''\n  window.addEventListener("lexiflow:examples-hydrated", event => {\n    const detail=event.detail||{};\n    const word=String(detail.word||"").trim().toLowerCase();\n    const senses=Array.isArray(detail.senses)?detail.senses:[];\n    if(!word||!senses.length)return;\n    let changed=false;\n    for(const card of state.data.cards){\n      if(String(card.word||"").trim().toLowerCase()!==word)continue;\n      const hit=senses.find(s=>\n        String(s.exampleEn||"").trim()===String(card.exampleEn||"").trim() &&\n        (!card.meaningZh || String(s.meaningZh||"").trim()===String(card.meaningZh||"").trim())\n      );\n      if(!hit||!String(hit.exampleZh||"").trim())continue;\n      if(!String(card.exampleZh||"").trim()){\n        card.exampleZh=String(hit.exampleZh).trim();\n        card.exampleTranslationPending=false;\n        card.updatedAt=new Date().toISOString();\n        changed=true;\n      }\n    }\n    if(changed){saveData();render();}\n  });\n'''
replace_once(app, '\n  window.addEventListener("beforeunload",()=>{', listener + '\n  window.addEventListener("beforeunload",()=>{')

print("patched server-runtime.js and public/app.js")
