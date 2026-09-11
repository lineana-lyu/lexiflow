from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "server-runtime.js"
text = p.read_text(encoding="utf-8")

replacements = [
    (
        'const ecdict = require("./lib/ecdict");\nconst exampleEnrichment = require("./lib/example-enrichment");',
        'const ecdict = require("./lib/ecdict");\nconst coreLexicon = require("./lib/core-lexicon");\nconst exampleEnrichment = require("./lib/example-enrichment");'
    ),
    (
        '''function localLookupResult(word, mode = "primary", sourceQuery = "") {\n  return ecdict.lookupExact(word, mode, {\n    sourceQuery: sourceQuery || word,\n    autoResolved: Boolean(sourceQuery && sourceQuery.toLowerCase() !== String(word || "").toLowerCase()),\n  });\n}\n\nfunction localChineseResult(query) {\n  const result = ecdict.bestChineseLookup(query);\n  if (!result) return null;\n  return Number(result.localSearchScore || 0) >= 400 ? result : null;\n}\n''',
        '''function localLookupResult(word, mode = "primary", sourceQuery = "") {\n  const options = {\n    sourceQuery: sourceQuery || word,\n    autoResolved: Boolean(sourceQuery && sourceQuery.toLowerCase() !== String(word || "").toLowerCase()),\n  };\n  return coreLexicon.lookupExact(word, mode, options) || ecdict.lookupExact(word, mode, options);\n}\n\nfunction localChineseResult(query) {\n  return coreLexicon.lookupChinese(query);\n}\n'''
    ),
    (
        '''    // ECDICT is excellent for exact English headword lookup, but translation\n    // substring search is not a reliable Chinese -> English resolver. Chinese\n    // queries therefore fall through to the semantic resolver in server.js.\n    if (hasChinese) return false;\n    const result = /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)\n      ? localLookupResult(query.toLowerCase(), "primary", query)\n      : null;\n''',
        '''    if (hasChinese) {\n      const result = localChineseResult(query);\n      if (!result) return false;\n      writeJson(res, 200, { ok: true, result: { ...result, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n      console.log(`LexiFlow lookup [${result.lookupPath || "core-zh"}] ${result.lookupMs ?? "?"}ms: ${query} -> ${result.word}`);\n      return true;\n    }\n    const result = /^[A-Za-z][A-Za-z\\s'-]*$/.test(query)\n      ? localLookupResult(query.toLowerCase(), "primary", query)\n      : null;\n'''
    ),
    (
        '''    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n    return true;\n  }\n\n  if (pathname === "/api/dictionary/lookup") {''',
        '''    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n    console.log(`LexiFlow lookup [${result.lookupPath || result.dictionarySource || "local"}] ${result.lookupMs ?? "?"}ms: ${query}`);\n    return true;\n  }\n\n  if (pathname === "/api/dictionary/lookup") {'''
    ),
    (
        '''    if (!result) return false;\n    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n    return true;\n  }\n\n  if (pathname === "/api/dictionary/pronunciation") {''',
        '''    if (!result) return false;\n    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });\n    console.log(`LexiFlow lookup [${result.lookupPath || result.dictionarySource || "local"}] ${result.lookupMs ?? "?"}ms: ${word}`);\n    return true;\n  }\n\n  if (pathname === "/api/dictionary/pronunciation") {'''
    ),
    (
        '''  const local = localLookupResult(word, "primary", word);\n  try {\n    const remote = await requestInnerJson("/api/dictionary/pronunciation", {''',
        '''  const local = localLookupResult(word, "primary", word);\n  if (local?.audioUrl) {\n    writeJson(res, 200, {\n      ok: true,\n      result: {\n        phonetic: local.phonetic || "",\n        audioUrl: local.audioUrl,\n        audioUrls: Array.isArray(local.audioUrls) ? local.audioUrls : [local.audioUrl],\n        pronunciationSource: local.pronunciationSource || "wikimedia-commons",\n        exactMatch: true,\n        dictionaryAudio: true,\n        localLookup: true,\n      },\n    });\n    return true;\n  }\n  try {\n    const remote = await requestInnerJson("/api/dictionary/pronunciation", {'''
    ),
    (
        '''        const local = ecdict.status();\n        payload.dictionary = {\n          ...(payload.dictionary || {}),\n          provider: local.available ? "ECDICT 本地词典 + Merriam-Webster / AI 例句补全" : "Merriam-Webster's Learner's Dictionary（ECDICT 未准备）",\n          localAvailable: local.available,\n          localEntries: local.entries,\n          localDatabase: local.path ? path.basename(local.path) : "",\n          fallbackConfigured: Boolean(payload.dictionary?.configured),\n          configured: local.available || Boolean(payload.dictionary?.configured),\n          exampleHydration: true,\n        };''',
        '''        const local = ecdict.status();\n        const core = coreLexicon.status();\n        payload.dictionary = {\n          ...(payload.dictionary || {}),\n          provider: core.available ? "LexiFlow Core + ECDICT + Merriam-Webster 增强" : (local.available ? "ECDICT 本地词典 + Merriam-Webster / AI 例句补全" : "Merriam-Webster's Learner's Dictionary（本地词库未准备）"),\n          localAvailable: core.available || local.available,\n          localEntries: local.entries,\n          localDatabase: local.path ? path.basename(local.path) : "",\n          coreAvailable: core.available,\n          coreWords: core.words,\n          coreSenses: core.senses,\n          coreChineseAliases: core.zhAliases,\n          coreDatabase: core.path ? path.basename(core.path) : "",\n          fallbackConfigured: Boolean(payload.dictionary?.configured),\n          configured: core.available || local.available || Boolean(payload.dictionary?.configured),\n          exampleHydration: true,\n        };'''
    ),
    (
        '''  const local = ecdict.status();\n  console.log(`LexiFlow dictionary: ${local.available ? `ECDICT local (${local.entries || "ready"})` : "MW/Codex fallback"}`);''',
        '''  const local = ecdict.status();\n  const core = coreLexicon.status();\n  console.log(`LexiFlow dictionary: ${core.available ? `Core local (${core.words || "ready"} words / ${core.zhAliases || 0} zh aliases)` : (local.available ? `ECDICT local (${local.entries || "ready"})` : "MW/Codex fallback")}`);'''
    ),
    (
        '''function stopServer() {\n  ecdict.close();''',
        '''function stopServer() {\n  coreLexicon.close();\n  ecdict.close();'''
    ),
]

for before, after in replacements:
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"expected one replacement, got {count}: {before[:100]!r}")
    text = text.replace(before, after, 1)

p.write_text(text, encoding="utf-8")
print("patched server-runtime.js for LexiFlow Core v2")
