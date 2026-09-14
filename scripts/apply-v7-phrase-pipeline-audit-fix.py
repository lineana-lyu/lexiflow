from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, got {count}")
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=re.S):
    new_text, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one replacement, got {count}")
    return new_text


# ---------------------------------------------------------------------------
# 1) One AI transport authority.
# Expression lookup and example enrichment must use the same runCodex transport
# that Settings /api/ai/test verifies. Keep direct CLI only as a standalone
# fallback for modules used outside server-runtime.
# ---------------------------------------------------------------------------
expr = read("lib/expression-query.js")
expr = replace_once(
    expr,
    'const DEFAULT_MODEL = "gpt-5.6-luna";\n',
    'const DEFAULT_MODEL = "gpt-5.6-luna";\nlet externalAiRunner = null;\n',
    "expression external AI runner state",
)
expr = replace_once(
    expr,
    'function runCodexJson(prompt, timeoutMs = 22000) {\n  const runtime = loadRuntimeSettings();',
    'function setAiRunner(runner) {\n  externalAiRunner = typeof runner === "function" ? runner : null;\n}\n\nfunction runCodexJson(prompt, timeoutMs = 22000) {\n  if (externalAiRunner) {\n    return Promise.resolve(externalAiRunner(prompt, timeoutMs)).then(extractJson);\n  }\n  const runtime = loadRuntimeSettings();',
    "expression runner binding",
)
expr = replace_once(
    expr,
    'module.exports = { classifyEnglishQuery, resolveEnglishExpression };',
    'module.exports = { classifyEnglishQuery, resolveEnglishExpression, setAiRunner };',
    "expression exports",
)
write("lib/expression-query.js", expr)

enrichment = read("lib/example-enrichment.js")
enrichment = replace_once(
    enrichment,
    'let cache = null;\nlet aiQueue = Promise.resolve();\n',
    'let cache = null;\nlet aiQueue = Promise.resolve();\nlet externalAiRunner = null;\n',
    "example external AI runner state",
)
enrichment = replace_once(
    enrichment,
    'async function runCodex(prompt, timeoutMs = 18000) {\n  const command = resolveCodexExecutable();',
    'function setAiRunner(runner) {\n  externalAiRunner = typeof runner === "function" ? runner : null;\n}\n\nasync function runCodex(prompt, timeoutMs = 18000) {\n  if (externalAiRunner) return clean(await externalAiRunner(prompt, timeoutMs));\n  const command = resolveCodexExecutable();',
    "example runner binding",
)
enrichment = replace_once(
    enrichment,
    'module.exports = {\n  getCachedExamples,\n  storeExamples,\n  generateExamples,\n  translateExamples,\n};',
    'module.exports = {\n  getCachedExamples,\n  storeExamples,\n  generateExamples,\n  translateExamples,\n  setAiRunner,\n};',
    "example exports",
)
write("lib/example-enrichment.js", enrichment)

server = read("server.js")
server = replace_once(
    server,
    '    res.writeHead(200, { "Content-Type": mimeType(filePath), "Content-Length": stat.size });',
    '    res.writeHead(200, { "Content-Type": mimeType(filePath), "Content-Length": stat.size, "Cache-Control": "no-store" });',
    "disable stale static asset cache",
)
internal_ai_route = '''    if (req.method === "POST" && url.pathname === "/api/internal/codex") {
      const body = await readJsonBody(req, 128 * 1024);
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return sendJson(res, 400, { ok:false, code:"AI_PROMPT_REQUIRED", error:"缺少 AI 请求内容" });
      const requestedTimeout = Number(body.timeoutMs || 30000);
      const timeoutMs = Math.max(5000, Math.min(Number.isFinite(requestedTimeout) ? requestedTimeout : 30000, 90000));
      try {
        const result = await runCodex(prompt, { timeoutMs, workspaceWrite:false });
        return sendJson(res, 200, { ok:true, stdout:String(result.stdout || ""), transport:result.transport || "" });
      } catch (err) {
        const friendly = friendlyError(err, "text");
        return sendJson(res, 502, { ok:false, code:friendly.code, error:friendly.message, userError:friendly });
      }
    }

'''
server = replace_once(
    server,
    '    if (req.method === "POST" && url.pathname === "/api/ai/test") {',
    internal_ai_route + '    if (req.method === "POST" && url.pathname === "/api/ai/test") {',
    "internal codex gateway route",
)
write("server.js", server)

# ---------------------------------------------------------------------------
# 2) Phrase meaning and pronunciation authority in server-runtime.
# - curated phrase dictionary first
# - exact ECDICT phrase as coverage fallback, but NEVER reuse its phonetic/audio
# - phrase IPA composed from complete word IPA when no whole-expression IPA exists
# - phrase audio is one exact whole-expression recording or one whole-expression TTS
# - phrase pronunciation never falls through raw to the inner component endpoint
# ---------------------------------------------------------------------------
runtime = read("server-runtime.js")
runtime = replace_once(
    runtime,
    '''function localPhraseResult(phrase, mode = "primary") {
  return phraseDictionary.lookupExact(phrase, mode, { sourceQuery:phrase });
}''',
    '''function localPhraseResult(phrase, mode = "primary") {
  const curated = phraseDictionary.lookupExact(phrase, mode, { sourceQuery:phrase });
  if (curated) return curated;
  // ECDICT has broad exact multi-word coverage. Use it only for phrase semantics;
  // its legacy phonetic field is not trusted for a whole expression because some
  // rows contain only the first component pronunciation.
  const fallback = ecdict.lookupExact(phrase, mode, { sourceQuery:phrase });
  if (!fallback || !/\\s/.test(String(fallback.word || ""))) return null;
  return {
    ...fallback,
    phonetic:"",
    audioUrl:"",
    audioUrls:[],
    pronunciationSource:"",
    phraseCard:true,
    queryKind:"phrase",
    dictionarySource:`${fallback.dictionarySource || "ECDICT"} · phrase fallback`,
    phraseFallback:true,
  };
}''',
    "phrase semantic fallback",
)
runner_binding = '''async function runInnerAiText(prompt, timeoutMs = 30000) {
  const safeTimeout = Math.max(5000, Math.min(Number(timeoutMs) || 30000, 90000));
  const response = await requestInnerJson("/api/internal/codex", {
    method:"POST",
    body:{ prompt:String(prompt || ""), timeoutMs:safeTimeout },
    timeoutMs:safeTimeout + 8000,
  });
  if (response.status < 200 || response.status >= 300 || !response.payload?.ok) {
    const err = new Error(clean(response.payload?.userError?.message || response.payload?.error || "AI transport unavailable"));
    err.code = clean(response.payload?.code) || "AI_TRANSPORT_UNAVAILABLE";
    throw err;
  }
  return String(response.payload.stdout || "");
}

if (typeof expressionQuery.setAiRunner === "function") expressionQuery.setAiRunner(runInnerAiText);
if (typeof exampleEnrichment.setAiRunner === "function") exampleEnrichment.setAiRunner(runInnerAiText);

'''
runtime = replace_once(
    runtime,
    'async function handleEnglishExpression(res, body) {',
    runner_binding + 'async function handleEnglishExpression(res, body) {',
    "bind shared AI gateway",
)

pronunciation_block = r'''function phoneticToken(value) {
  return clean(value).replace(/^\/+|\/+$/g, "").replace(/^\[+|\]+$/g, "").trim();
}

function phraseParts(value) {
  return clean(value)
    .split(/\s+/)
    .map(part => part.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, ""))
    .filter(Boolean);
}

async function composePhrasePhonetic(expression) {
  const parts = phraseParts(expression);
  if (parts.length < 2 || parts.length > 10) return "";
  const tokens = [];
  for (const part of parts) {
    let token = phoneticToken(localLookupResult(part.toLowerCase(), "primary", part)?.phonetic);
    if (!token) {
      try {
        const remote = await requestInnerJson("/api/dictionary/pronunciation", {
          method:"POST",
          body:{ word:part.toLowerCase() },
          timeoutMs:7000,
        });
        token = phoneticToken(remote.payload?.result?.phonetic);
      } catch {}
    }
    if (!token) return "";
    tokens.push(token);
  }
  return `/${tokens.join(" ")}/`;
}

async function handlePronunciation(res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
    return true;
  }

  const word = clean(parsed.word).toLowerCase();
  if (!/^[a-z][a-z '-]*$/i.test(word)) {
    writeJson(res, 400, { ok: false, code: "INVALID_WORD", error: "请输入英文单词或短语" });
    return true;
  }

  const queryKind = expressionQuery.classifyEnglishQuery(word);
  const local = queryKind === "phrase" ? localPhraseResult(word, "primary") : localLookupResult(word, "primary", word);

  if (queryKind === "phrase") {
    let remotePronunciation = null;
    try {
      const remote = await requestInnerJson("/api/dictionary/pronunciation", {
        method:"POST",
        body:{ word },
        timeoutMs:10000,
      });
      if (remote.status >= 200 && remote.status < 300) remotePronunciation = remote.payload?.result || null;
    } catch {}

    const remoteExact = remotePronunciation?.exactMatch === true;
    const rawAudio = [
      clean(remotePronunciation?.audioUrl),
      ...(Array.isArray(remotePronunciation?.audioUrls) ? remotePronunciation.audioUrls.map(clean) : []),
    ].filter(Boolean);
    const uniqueAudio = Array.from(new Set(rawAudio));
    // Phrase dictionary playback has a single-owner rule: only one exact whole
    // expression recording may play. Component arrays are never exposed.
    const exactWholeAudio = remoteExact && uniqueAudio.length ? uniqueAudio[0] : "";

    let phrasePhonetic = clean(local?.phonetic);
    let phoneticSource = phrasePhonetic ? clean(local?.pronunciationSource) : "";
    if (!phrasePhonetic && remoteExact && clean(remotePronunciation?.phonetic)) {
      phrasePhonetic = clean(remotePronunciation.phonetic);
      phoneticSource = clean(remotePronunciation.pronunciationSource) || "merriam-webster-whole-expression";
    }
    if (!phrasePhonetic) {
      phrasePhonetic = await composePhrasePhonetic(word);
      if (phrasePhonetic) phoneticSource = "composed-exact-word-ipa";
    }

    writeJson(res, 200, {
      ok:true,
      result:{
        phonetic:phrasePhonetic,
        audioUrl:exactWholeAudio,
        audioUrls:exactWholeAudio ? [exactWholeAudio] : [],
        pronunciationSource:exactWholeAudio
          ? (clean(remotePronunciation?.pronunciationSource) || "merriam-webster-whole-expression")
          : phoneticSource,
        exactMatch:Boolean(local?.dictionaryExact || remoteExact),
        wholeExpressionPhonetic:Boolean(phrasePhonetic),
        dictionaryAudio:Boolean(exactWholeAudio),
        wholeExpressionAudio:Boolean(exactWholeAudio),
        localLookup:Boolean(local),
        pronunciationPolicy:"whole-expression-v2",
      },
    });
    return true;
  }

  if (local?.audioUrl) {
    writeJson(res, 200, {
      ok:true,
      result:{
        phonetic:local.phonetic || "",
        audioUrl:local.audioUrl,
        audioUrls:Array.isArray(local.audioUrls) ? local.audioUrls : [local.audioUrl],
        pronunciationSource:local.pronunciationSource || "wikimedia-commons",
        exactMatch:true,
        dictionaryAudio:true,
        wholeExpressionAudio:true,
        wholeExpressionPhonetic:Boolean(local.phonetic),
        localLookup:true,
      },
    });
    return true;
  }

  try {
    const remote = await requestInnerJson("/api/dictionary/pronunciation", {
      method:"POST",
      body:{ word },
      timeoutMs:10000,
    });
    const pronunciation = remote.payload?.result;
    const candidates = Array.from(new Set([
      clean(pronunciation?.audioUrl),
      ...(Array.isArray(pronunciation?.audioUrls) ? pronunciation.audioUrls.map(clean) : []),
    ].filter(Boolean)));
    if (remote.status >= 200 && remote.status < 300 && pronunciation && (candidates.length || clean(pronunciation.phonetic))) {
      const singleAudio = candidates[0] || "";
      writeJson(res, 200, {
        ok:true,
        result:{
          ...pronunciation,
          phonetic:clean(pronunciation.phonetic) || clean(local?.phonetic),
          audioUrl:singleAudio,
          audioUrls:singleAudio ? [singleAudio] : [],
          dictionaryAudio:Boolean(singleAudio),
          wholeExpressionAudio:true,
          wholeExpressionPhonetic:Boolean(clean(pronunciation.phonetic) || clean(local?.phonetic)),
          localLookup:false,
        },
      });
      return true;
    }
  } catch {}

  if (local?.phonetic) {
    writeJson(res, 200, {
      ok:true,
      result:{
        phonetic:local.phonetic,
        audioUrl:"",
        audioUrls:[],
        pronunciationSource:"ecdict-phonetic",
        exactMatch:true,
        wholeExpressionAudio:true,
        wholeExpressionPhonetic:true,
        dictionaryAudio:false,
        localLookup:true,
      },
    });
    return true;
  }
  return false;
}

'''
runtime = sub_once(
    runtime,
    r'async function handlePronunciation\(res, body\) \{.*?\n\}\n\nfunction normalizePos',
    pronunciation_block + 'function normalizePos',
    "replace pronunciation pipeline",
)
runtime = replace_once(
    runtime,
    '        const local = ecdict.status();\n        const core = coreLexicon.status();\n        payload.dictionary = {',
    '        const local = ecdict.status();\n        const core = coreLexicon.status();\n        const phrases = phraseDictionary.status();\n        payload.dictionary = {',
    "phrase dictionary status",
)
runtime = replace_once(
    runtime,
    '          coreDatabase: core.path ? path.basename(core.path) : "",\n          fallbackConfigured:',
    '          coreDatabase: core.path ? path.basename(core.path) : "",\n          phraseAvailable: phrases.available,\n          phraseEntries: phrases.phrases,\n          phraseDatabase: phrases.path ? path.basename(phrases.path) : "",\n          fallbackConfigured:',
    "phrase dictionary status fields",
)
runtime = replace_once(
    runtime,
    '    const url = new URL(req.url, `http://${HOST}:${OUTER_PORT}`);\n    if (req.method === "OPTIONS") {',
    '    const url = new URL(req.url, `http://${HOST}:${OUTER_PORT}`);\n    if (url.pathname.startsWith("/api/internal/")) {\n      return writeJson(res, 404, { ok:false, code:"NOT_FOUND", error:"Not found" });\n    }\n    if (req.method === "OPTIONS") {',
    "hide internal AI gateway from outer API",
)
write("server-runtime.js", runtime)

# ---------------------------------------------------------------------------
# 3) Frontend defensive rules. A partial phrase phonetic must never overwrite
# the phrase line; unverified phrase audio must never be trusted from stale card
# state, and ambiguous multi-file phrase audio falls back to one TTS utterance.
# ---------------------------------------------------------------------------
hydration = read("public/example-hydration.js")
hydration = replace_once(
    hydration,
    '    if (phonetic) result.phonetic = phonetic;\n\n    if (isPhrase) {',
    '    const wholePhrasePhonetic = !isPhrase || pronunciation.wholeExpressionPhonetic === true;\n    if (phonetic && wholePhrasePhonetic) result.phonetic = phonetic;\n\n    if (isPhrase) {',
    "guard partial phrase phonetic",
)
hydration = replace_once(
    hydration,
    '    const phoneticNode = document.querySelector(".learning-card-wordtop .phonetic");\n    if (phoneticNode && phonetic) phoneticNode.textContent = phonetic.startsWith("/") || phonetic.startsWith("[") ? phonetic : `/${phonetic}/`;',
    '    const phoneticNode = document.querySelector(".learning-card-wordtop .phonetic");\n    if (phoneticNode && phonetic && wholePhrasePhonetic) phoneticNode.textContent = phonetic.startsWith("/") || phonetic.startsWith("[") ? phonetic : `/${phonetic}/`;',
    "guard phrase phonetic DOM",
)
hydration = replace_once(
    hydration,
    '    if(isPhrase&&!clean(pronunciation?.phonetic)){\n      const composite=await composePhrasePhonetic(result.word);\n      if(composite)patchPronunciation(result,{phonetic:composite});\n    }',
    '    if(isPhrase&&pronunciation?.wholeExpressionPhonetic!==true){\n      const composite=await composePhrasePhonetic(result.word);\n      if(composite)patchPronunciation(result,{phonetic:composite,wholeExpressionPhonetic:true,dictionaryAudio:false,wholeExpressionAudio:false,exactMatch:false});\n    }',
    "force complete phrase phonetic fallback",
)
write("public/example-hydration.js", hydration)

app = read("public/app.js")
app = replace_once(
    app,
    '    return candidates.length?[candidates[0]]:[];\n  }\n\n  async function speak(word,audioUrl="",audioUrls=[]){',
    '    return candidates.length===1?[candidates[0]]:[];\n  }\n\n  async function speak(word,audioUrl="",audioUrls=[]){',
    "single continuous phrase recording",
)
write("public/app.js", app)

# ---------------------------------------------------------------------------
# 4) Durable regression contracts.
# ---------------------------------------------------------------------------
check = read("scripts/check-expression-query-v4.js")
check = replace_once(
    check,
    'const productCss = fs.readFileSync(path.join(root, "public", "product-ux.css"), "utf8");\n',
    'const productCss = fs.readFileSync(path.join(root, "public", "product-ux.css"), "utf8");\nconst server = fs.readFileSync(path.join(root, "server.js"), "utf8");\nconst expressionSource = fs.readFileSync(path.join(root, "lib", "expression-query.js"), "utf8");\nconst enrichmentSource = fs.readFileSync(path.join(root, "lib", "example-enrichment.js"), "utf8");\n',
    "regression sources",
)
check = replace_once(
    check,
    'assert(hydration.includes("composePhrasePhonetic")&&hydration.includes("if(isPhrase&&!clean(pronunciation?.phonetic))"), "phrase lookup must prefer whole-expression IPA and only compose component IPA when whole-expression IPA is unavailable");',
    'assert(hydration.includes("composePhrasePhonetic")&&hydration.includes("pronunciation?.wholeExpressionPhonetic!==true")&&hydration.includes("wholeExpressionPhonetic:true"), "phrase lookup must reject partial phonetics and compose a complete fallback only when whole-expression IPA is unavailable");',
    "phrase IPA regression contract",
)
check = replace_once(
    check,
    'assert(runtime.includes(\'const local = queryKind === "phrase" ? localPhraseResult(word, "primary")\')&&runtime.includes(\'const componentOnly = queryKind === "phrase" && pronunciation?.exactMatch !== true\')&&runtime.includes(\'wholeExpressionAudio\'), "phrase pronunciation must combine exact whole-phrase IPA with exact-recording-only audio ownership");',
    'assert(runtime.includes("composePhrasePhonetic")&&runtime.includes(\'pronunciationPolicy:"whole-expression-v2"\')&&runtime.includes("phraseFallback:true"), "phrase pronunciation must compose a complete IPA when necessary and keep phrase semantics on an exact local fallback");\nassert(runtime.includes("expressionQuery.setAiRunner(runInnerAiText)")&&runtime.includes("exampleEnrichment.setAiRunner(runInnerAiText)"), "all outer-runtime AI helpers must share the inner verified AI gateway");\nassert(server.includes(\'/api/internal/codex\')&&server.includes(\'runCodex(prompt, { timeoutMs, workspaceWrite:false })\'), "the inner AI gateway must use the same runCodex transport verified by Settings");\nassert(expressionSource.includes("externalAiRunner")&&expressionSource.includes("setAiRunner"), "expression lookup must support shared AI transport injection");\nassert(enrichmentSource.includes("externalAiRunner")&&enrichmentSource.includes("setAiRunner"), "example enrichment must support shared AI transport injection");\nassert(server.includes(\'"Cache-Control": "no-store"\'), "local UI assets must not stay on a stale cached JavaScript build after pull/restart");',
    "AI and phrase runtime regressions",
)
write("scripts/check-expression-query-v4.js", check)

surface = read("scripts/check-user-surface-v4.js")
surface = replace_once(
    surface,
    'assert(hydration.includes("pronunciation.wholeExpressionAudio === true")&&hydration.includes("result.audioUrl = first")&&hydration.includes("if(isPhrase&&!clean(pronunciation?.phonetic))"),"lookup hydration must remove component audio and preserve whole-expression IPA priority");',
    'assert(hydration.includes("pronunciation.wholeExpressionAudio === true")&&hydration.includes("result.audioUrl = first")&&hydration.includes("pronunciation?.wholeExpressionPhonetic!==true"),"lookup hydration must remove component audio and reject partial phrase IPA");',
    "surface phrase phonetic contract",
)
surface = replace_once(
    surface,
    'assert(runtime.includes(\'const singleAudio = componentOnly ? "" : (candidateAudioUrls[0] || "")\')&&runtime.includes("Boolean(singleAudio)"),"runtime must expose at most one verified continuous phrase recording");',
    'assert(runtime.includes(\'pronunciationPolicy:"whole-expression-v2"\')&&runtime.includes("exactWholeAudio")&&runtime.includes("composePhrasePhonetic"),"runtime must expose one verified phrase recording or synthesize the complete expression");',
    "surface phrase audio contract",
)
write("scripts/check-user-surface-v4.js", surface)

print("V7 phrase meaning / IPA / audio / AI transport audit repair staged.")
