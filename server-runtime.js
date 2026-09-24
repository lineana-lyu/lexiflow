"use strict";

const http = require("http");
const path = require("path");
const ecdict = require("./lib/ecdict");
const coreLexicon = require("./lib/core-lexicon");
const wordFamily = require("./lib/word-family");
const phraseDictionary = require("./lib/phrase-dictionary");
const exampleEnrichment = require("./lib/example-enrichment");
const expressionQuery = require("./lib/expression-query");
const lexemeIdentity = require("./lib/lexeme-identity");
const { trustedChineseCandidates } = require("./lib/chinese-candidate-resolver");
const kokoroTts = require("./lib/kokoro-tts");
const { PersistentEtymologyCache } = require("./lib/etymology-cache");
const { createEtymologyService } = require("./lib/etymology-service");

const HOST = "127.0.0.1";
const OUTER_PORT = Number(process.env.LEXIFLOW_PORT || 4177);
const INNER_PORT = Number(process.env.LEXIFLOW_INNER_PORT || (OUTER_PORT + 1));
const ORIGINAL_PORT = process.env.LEXIFLOW_PORT;
const ORIGINAL_NO_OPEN = process.env.LEXIFLOW_NO_OPEN;

let inner = null;
let proxy = null;
let startedAddress = "";

function clean(value) {
  return String(value || "").trim();
}

function writeJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseJsonBuffer(body) {
  if (!body?.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return true;
  if (origin === `http://${HOST}:${OUTER_PORT}` || origin === `http://localhost:${OUTER_PORT}`) return true;
  return origin === "null" && req.method === "GET" && req.url === "/api/health";
}

function localLookupResult(word, mode = "primary", sourceQuery = "") {
  const surface = clean(word).toLowerCase();
  const options = {
    sourceQuery: sourceQuery || surface,
    autoResolved: Boolean(sourceQuery && sourceQuery.toLowerCase() !== surface),
  };
  const surfaceMorphology = ecdict.lookupExact(surface, mode, options);
  const lemma = lexemeIdentity.exchangeBaseForm(surfaceMorphology) || surface;
  const lemmaOptions = {
    ...options,
    autoResolved: Boolean(options.autoResolved || lemma !== surface),
  };
  const core = coreLexicon.lookupExact(lemma, mode, lemmaOptions);
  const lemmaMorphology = ecdict.lookupExact(lemma, mode, lemmaOptions);
  const base = core || lemmaMorphology || surfaceMorphology;
  if (!base) return null;
  const morphology = lemmaMorphology || surfaceMorphology;
  const merged = {
    ...base,
    exchange: String(morphology?.exchange || base.exchange || ""),
    wordForms: Array.isArray(morphology?.wordForms)
      ? morphology.wordForms
      : (Array.isArray(base.wordForms) ? base.wordForms : []),
  };
  return lexemeIdentity.sanitizeLexemeExamples(
    lexemeIdentity.attachLexemeIdentity(merged, {
      candidateSurface: surface,
      morphology,
      source: merged.dictionarySource || merged.lookupPath || "local-dictionary",
    })
  );
}

async function enrichWordFamily(result, word) {
  const target = clean(word || result?.word).toLowerCase();
  if (!result || !/^[a-z][a-z'-]*$/i.test(target)) return result;
  try {
    const family = await wordFamily.lookup(target);
    return { ...result, wordFamily: Array.isArray(family) ? family : [] };
  } catch (err) {
    console.warn("word family lookup skipped:", err?.message || err);
    return { ...result, wordFamily: [] };
  }
}

function localPhraseResult(phrase, mode = "primary") {
  const surface = clean(phrase).toLowerCase();
  const curated = phraseDictionary.lookupExact(surface, mode, { sourceQuery:surface });
  if (curated) {
    return lexemeIdentity.sanitizeLexemeExamples(
      lexemeIdentity.attachLexemeIdentity(curated, { candidateSurface:surface, source:curated.dictionarySource || "phrase-dictionary" })
    );
  }
  // ECDICT has broad exact multi-word coverage. Use it only for phrase semantics;
  // its legacy phonetic field is not trusted for a whole expression because some
  // rows contain only the first component pronunciation.
  const fallback = ecdict.lookupExact(surface, mode, { sourceQuery:surface });
  if (!fallback || !/\s/.test(String(fallback.word || ""))) return null;
  const result = {
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
  return lexemeIdentity.sanitizeLexemeExamples(
    lexemeIdentity.attachLexemeIdentity(result, { candidateSurface:surface, morphology:fallback, source:result.dictionarySource })
  );
}


async function ensureWholePhrasePhonetic(result, phrase) {
  if (!result || !/\s/.test(clean(phrase))) return result;
  if (clean(result.phonetic) && result.wholeExpressionPhonetic === true) return result;
  const phonetic = await composePhrasePhonetic(phrase);
  if (!phonetic) return { ...result, phonetic:"", wholeExpressionPhonetic:false };
  return {
    ...result,
    phonetic,
    wholeExpressionPhonetic:true,
    pronunciationSource:"composed-exact-word-ipa",
  };
}

function localChineseResult(query, { preferredWord = "" } = {}) {
  const startedAt = Date.now();
  const ranked = trustedChineseCandidates(query, preferredWord);
  for (const candidate of ranked) {
    const canonical = candidate.canonicalWord || candidate.word;
    let result = coreLexicon.lookupChineseWord(canonical, query);
    if (!result && candidate.word !== canonical) result = coreLexicon.lookupChineseWord(candidate.word, query);
    if (!result && candidate.fallbackResult) result = candidate.fallbackResult;
    if (!result) continue;

    const morphology = /\s/.test(canonical)
      ? null
      : (ecdict.lookupExact(canonical, "primary", { sourceQuery:query, autoResolved:true }) || candidate.morphology);
    result = {
      ...result,
      sourceQuery:query,
      normalizedQuery:query,
      autoResolved:true,
      exchange:String(morphology?.exchange || result.exchange || ""),
      wordForms:Array.isArray(morphology?.wordForms)
        ? morphology.wordForms
        : (Array.isArray(result.wordForms) ? result.wordForms : []),
      alternatives:ranked
        .filter(item => item.canonicalWord !== canonical)
        .slice(0, 3)
        .map(item => ({ word:item.canonicalWord, meaningZh:query, source:item.source || "" })),
      lookupMs:Math.max(0, Date.now() - startedAt),
      lookupPath:"lexeme-zh-v5",
      lexicalRankScore:Number(candidate.rankScore || 0),
    };
    result = lexemeIdentity.attachLexemeIdentity(result, {
      candidateSurface:candidate.word,
      morphology,
      source:result.dictionarySource || result.lookupPath || candidate.source || "local-dictionary",
    });
    return lexemeIdentity.sanitizeLexemeExamples(result);
  }
  return null;
}

async function handleLocalDictionary(req, res, pathname, body) {
  if (req.method !== "POST") return false;
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
    return true;
  }

  if (pathname === "/api/search/smart") {
    const query = clean(parsed.query);
    if (!query) return false;
    const hasChinese = /[\u3400-\u9fff]/.test(query);
    if (hasChinese) {
      if (parsed.forceRefresh === true) return false;
      let result = localChineseResult(query, { preferredWord:clean(parsed.preferredWord) });
      if (!result) return false;
      result = await enrichWordFamily(result, result.word);
      writeJson(res, 200, { ok: true, result: { ...result, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
      console.log(`LexiFlow lookup [${result.lookupPath || "core-zh"}] ${result.lookupMs ?? "?"}ms: ${query} -> ${result.word}`);
      return true;
    }
    const queryKind = expressionQuery.classifyEnglishQuery(query);
    let result = null;
    if (queryKind === "word" && /^[A-Za-z][A-Za-z\s'-]*$/.test(query)) {
      result = localLookupResult(query.toLowerCase(), "primary", query);
      if (result) result = await enrichWordFamily(result, result.word || query);
    } else if (queryKind === "phrase" && /^[A-Za-z][A-Za-z\s'-]*$/.test(query)) {
      result = await ensureWholePhrasePhonetic(localPhraseResult(query.toLowerCase(), "primary"), query.toLowerCase());
    }
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, queryKind, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
    console.log(`LexiFlow lookup [${result.lookupPath || result.dictionarySource || "local"}] ${result.lookupMs ?? "?"}ms: ${query}`);
    return true;
  }

  if (pathname === "/api/dictionary/lookup") {
    const word = clean(parsed.word).toLowerCase();
    if (!/^[a-z][a-z '-]*$/i.test(word)) return false;
    const mode = parsed.mode === "expanded" ? "expanded" : "primary";
    const queryKind = expressionQuery.classifyEnglishQuery(word);
    if (queryKind === "phrase") {
      const localPhrase = await ensureWholePhrasePhonetic(localPhraseResult(word, mode), word);
      if (localPhrase) {
        writeJson(res, 200, { ok:true, result:{ ...localPhrase, examplesPending:localPhrase.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
        console.log("LexiFlow phrase dictionary lookup: " + word);
        return true;
      }
      try {
        const result = await expressionQuery.resolveEnglishExpression(word);
        if (!result) return false;
        writeJson(res, 200, { ok: true, result: { ...result, localLookup: false, expressionLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
        console.log("LexiFlow expression dictionary fallback: " + word);
      } catch (err) {
        writeJson(res, 503, {
          ok: false,
          code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",
          error: "完整短语暂时没有解析完成",
          userError: {
            code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",
            title: "短语暂未收录",
            message: "本地短语词典暂未收录这个表达，AI 补充解析也没有完成。LexiFlow 不会退回逐词字面义。",
          },
        });
      }
      return true;
    }
    let result = localLookupResult(word, mode, word);
    if (!result) return false;
    result = await enrichWordFamily(result, result.word || word);
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
    console.log("LexiFlow lookup [" + (result.lookupPath || result.dictionarySource || "local") + "] " + (result.lookupMs ?? "?") + "ms: " + word);
    return true;
  }

  if (pathname === "/api/dictionary/pronunciation") {
    // Pronunciation is handled separately: prefer real dictionary audio and
    // fall back to the ECDICT phonetic transcription when audio is unavailable.
    return false;
  }

  return false;
}

function requestInnerJson(pathname, { method = "GET", body = null, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const buffer = body === null ? null : Buffer.from(JSON.stringify(body));
    const headers = { "Accept": "application/json" };
    if (buffer) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(buffer.length);
    }
    const request = http.request({ host: HOST, port: INNER_PORT, method, path: pathname, headers }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        let payload = null;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
        resolve({ status: response.statusCode || 0, payload });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error("inner request timeout"), { code: "INNER_TIMEOUT" })));
    request.on("error", reject);
    if (buffer) request.end(buffer);
    else request.end();
  });
}

async function runInnerAiText(prompt, timeoutMs = 30000) {
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

let etymologyService = null;

async function innerMerriamWebsterEtymology(word) {
  const response = await requestInnerJson("/api/internal/etymology/merriam-webster", {
    method:"POST",
    body:{ word },
    timeoutMs:12000,
  });
  if (response.status < 200 || response.status >= 300 || !response.payload?.ok) {
    const err = new Error(clean(response.payload?.error || "Merriam-Webster etymology unavailable"));
    err.code = clean(response.payload?.code) || "ETYMOLOGY_MW_FAILED";
    throw err;
  }
  return response.payload.evidence || null;
}

function getEtymologyService() {
  if (etymologyService) return etymologyService;
  const cache = new PersistentEtymologyCache({ maxEntries:400 });
  etymologyService = createEtymologyService({
    cache,
    merriamWebsterProvider:innerMerriamWebsterEtymology,
    aiRunner:runInnerAiText,
  });
  return etymologyService;
}

async function handleEtymologyExplain(res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    writeJson(res, 400, { ok:false, code:"INVALID_JSON", error:"请求格式不正确" });
    return;
  }

  try {
    const result = await getEtymologyService().explain(parsed.word, {
      meaningZh:clean(parsed.meaningZh),
      forceRefresh:parsed.forceRefresh === true,
    });
    writeJson(res, 200, { ok:true, result });
  } catch (err) {
    const code = clean(err?.code) || "ETYMOLOGY_LOOKUP_FAILED";
    const invalid = code === "ETYMOLOGY_INVALID_WORD";
    writeJson(res, invalid ? 400 : 503, {
      ok:false,
      code,
      error:invalid ? "请输入一个英文单词" : "词源解释暂时没有准备完成",
    });
  }
}

async function handleEnglishExpression(res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
    return true;
  }
  const query = clean(parsed.query);
  const queryKind = expressionQuery.classifyEnglishQuery(query);
  if (!new Set(["phrase", "sentence"]).has(queryKind)) return false;
  if (queryKind === "phrase") {
    const localPhrase = await ensureWholePhrasePhonetic(localPhraseResult(query, "primary"), query);
    if (localPhrase) {
      writeJson(res, 200, { ok:true, result:localPhrase });
      console.log(`LexiFlow phrase dictionary: ${query}`);
      return true;
    }
  }
  try {
    const result = await expressionQuery.resolveEnglishExpression(query);
    if (!result) return false;
    writeJson(res, 200, { ok: true, result });
    console.log(`LexiFlow expression [${queryKind}]: ${query} -> ${result.word}`);
    return true;
  } catch (err) {
    console.warn("LexiFlow expression query failed:", err?.message || err);
    writeJson(res, 503, {
      ok: false,
      code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",
      error: "完整表达暂时没有解析完成",
      userError: {
        code: err?.code || "EXPRESSION_QUERY_UNAVAILABLE",
        title: queryKind === "sentence" ? "短句解析暂时不可用" : "短语解析暂时不可用",
        message: "LexiFlow 会保留你输入的完整表达，不会把它拆成单词。请确认 AI 连接后重试。",
      },
    });
    return true;
  }
}

function phoneticToken(value) {
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
    // Multi-word playback has one canonical policy: synthesize the entire
    // expression in one TTS request. Dictionary APIs often expose an exact
    // phrase headword while attaching audio/IPA for only the lexical head, so
    // phrase audio is never accepted from the single-word dictionary channel.
    let phrasePhonetic = clean(local?.phonetic);
    let phoneticSource = phrasePhonetic ? clean(local?.pronunciationSource) : "";
    if (!phrasePhonetic) {
      phrasePhonetic = await composePhrasePhonetic(word);
      if (phrasePhonetic) phoneticSource = "composed-exact-word-ipa";
    }

    writeJson(res, 200, {
      ok:true,
      result:{
        phonetic:phrasePhonetic,
        audioUrl:"",
        audioUrls:[],
        pronunciationSource:phoneticSource,
        exactMatch:Boolean(local?.dictionaryExact || local?.exactMatch),
        wholeExpressionPhonetic:Boolean(phrasePhonetic),
        dictionaryAudio:false,
        wholeExpressionAudio:false,
        localLookup:Boolean(local),
        pronunciationPolicy:"whole-expression-tts-v3",
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

function normalizePos(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return "";
  if (/\bverb\b|\bvi\b|\bvt\b|^v\.?$/.test(raw)) return "verb";
  if (/\bnoun\b|^n\.?$/.test(raw)) return "noun";
  if (/\badjective\b|\badj\b|^a\.?$/.test(raw)) return "adjective";
  if (/\badverb\b|\badv\b/.test(raw)) return "adverb";
  return raw.split(/[ ·,/|]+/)[0];
}

function chineseTokens(value) {
  return clean(value)
    .split(/[；;、，,。/（）()\s]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 1);
}

function englishKeywords(value) {
  const stop = new Set(["the","a","an","to","of","and","or","in","on","for","with","is","be","that","this","someone","something"]);
  return clean(value).toLowerCase().match(/[a-z]{3,}/g)?.filter(word => !stop.has(word)) || [];
}

function senseMatchScore(local, remote, localIndex, remoteIndex) {
  let score = 0;
  const lp = normalizePos(local?.pos);
  const rp = normalizePos(remote?.pos);
  if (lp && rp && lp === rp) score += 4;

  const localZh = chineseTokens(local?.meaningZh);
  const remoteZh = chineseTokens(remote?.meaningZh);
  for (const a of localZh) {
    if (remoteZh.some(b => a === b || a.includes(b) || b.includes(a))) {
      score += 4;
      break;
    }
  }

  const localEn = englishKeywords(local?.senseIntentEn);
  const remoteEn = englishKeywords(remote?.senseIntentEn);
  const overlap = localEn.filter(word => remoteEn.includes(word)).length;
  score += Math.min(overlap, 3);
  if (localIndex === remoteIndex) score += 0.5;
  return score;
}

function pickDictionaryExamples(localSenses, remoteResult) {
  const remoteSenses = Array.isArray(remoteResult?.senses) ? remoteResult.senses : [];
  const used = new Set();
  const out = [];
  (Array.isArray(localSenses) ? localSenses : []).forEach((localSense, localIndex) => {
    let best = null;
    remoteSenses.forEach((remoteSense, remoteIndex) => {
      if (used.has(remoteIndex) || !clean(remoteSense?.exampleEn) || !clean(remoteSense?.exampleZh)) return;
      const score = senseMatchScore(localSense, remoteSense, localIndex, remoteIndex);
      if (!best || score > best.score) best = { remoteSense, remoteIndex, score };
    });
    const singleSenseSafe = localSenses.length === 1 && remoteSenses.length === 1 && normalizePos(localSense?.pos) === normalizePos(remoteSenses[0]?.pos);
    if (!best || (best.score < 4 && !singleSenseSafe)) return;
    used.add(best.remoteIndex);
    out.push({
      id: clean(localSense.id),
      exampleEn: clean(best.remoteSense.exampleEn),
      exampleZh: clean(best.remoteSense.exampleZh),
      source: "merriam-webster",
      cacheHit: Boolean(remoteResult?.cacheHit),
    });
  });
  return out;
}

async function tryDictionaryExamples(word, senses) {
  try {
    const status = await requestInnerJson("/api/status", { timeoutMs: 1800 });
    if (!status.payload?.dictionary?.configured) return [];
    const lookup = await requestInnerJson("/api/dictionary/lookup", {
      method: "POST",
      body: { word, mode: senses.length > 1 ? "expanded" : "primary" },
      timeoutMs: 12000,
    });
    if (lookup.status < 200 || lookup.status >= 300 || !lookup.payload?.result) return [];
    return pickDictionaryExamples(senses, lookup.payload.result);
  } catch {
    return [];
  }
}

function mergeExamples(...groups) {
  const map = new Map();
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      const id = clean(item?.id);
      if (!id || map.has(id) || !clean(item?.exampleEn) || !clean(item?.exampleZh)) continue;
      map.set(id, item);
    }
  }
  return Array.from(map.values());
}

async function handleExampleHydration(req, res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    return writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
  }

  const word = clean(parsed.word).toLowerCase();
  const senses = (Array.isArray(parsed.senses) ? parsed.senses : [])
    .slice(0, 4)
    .map((sense, index) => ({
      id: clean(sense?.id) || `sense-${index + 1}`,
      pos: clean(sense?.pos),
      meaningZh: clean(sense?.meaningZh),
      senseIntentEn: clean(sense?.senseIntentEn),
      exampleEn: clean(sense?.exampleEn),
      exampleZh: clean(sense?.exampleZh),
    }))
    .filter(sense => sense.meaningZh);

  if (!/^[a-z][a-z '-]*$/i.test(word) || !senses.length) {
    return writeJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "缺少有效的单词或词义" });
  }

  const warnings = [];
  const supplied = senses
    .filter(sense => sense.exampleEn && sense.exampleZh)
    .map(sense => ({ id: sense.id, exampleEn: sense.exampleEn, exampleZh: sense.exampleZh, source: "local-dictionary", cacheHit: false }));
  const cached = await exampleEnrichment.getCachedExamples(word, senses);
  let combined = mergeExamples(supplied, cached);

  // If a dictionary already supplied the English example, preserve it exactly.
  // AI is only allowed to translate the missing Chinese text; it must not rewrite
  // or replace the source example.
  const translationOnly = senses.filter(sense =>
    sense.exampleEn && !sense.exampleZh && !combined.some(item => item.id === sense.id)
  );
  if (translationOnly.length) {
    try {
      const translated = await exampleEnrichment.translateExamples(word, translationOnly);
      if (translated.length) {
        await exampleEnrichment.storeExamples(word, translationOnly, translated).catch(() => {});
        combined = mergeExamples(combined, translated);
      }
    } catch (err) {
      warnings.push(clean(err?.code) || "EXAMPLE_TRANSLATION_UNAVAILABLE");
      console.warn("example translation failed:", err?.message || err);
    }
  }

  // Only senses that genuinely have no English example may ask another dictionary
  // or AI to supply one. This avoids replacing a perfectly good local example.
  const missingEnglish = senses.filter(sense =>
    !sense.exampleEn && !combined.some(item => item.id === sense.id)
  );
  let dictionaryExamples = [];
  if (missingEnglish.length) {
    dictionaryExamples = await tryDictionaryExamples(word, missingEnglish);
    if (dictionaryExamples.length) {
      await exampleEnrichment.storeExamples(word, missingEnglish, dictionaryExamples).catch(() => {});
      combined = mergeExamples(combined, dictionaryExamples);
    }
  }

  const stillMissingEnglish = missingEnglish.filter(sense => !combined.some(item => item.id === sense.id));
  if (stillMissingEnglish.length) {
    try {
      const generated = await exampleEnrichment.generateExamples(word, stillMissingEnglish);
      if (generated.length) {
        await exampleEnrichment.storeExamples(word, stillMissingEnglish, generated).catch(() => {});
        combined = mergeExamples(combined, generated);
      }
    } catch (err) {
      warnings.push(clean(err?.code) || "EXAMPLE_AI_UNAVAILABLE");
      console.warn("example enrichment failed:", err?.message || err);
    }
  }

  return writeJson(res, 200, {
    ok: true,
    word,
    senses: combined,
    complete: combined.length >= senses.length,
    warnings,
  });
}

async function handleKokoroTts(res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    return writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
  }
  const text = clean(parsed.text).slice(0, 600);
  if (!text) return writeJson(res, 400, { ok: false, code: "KOKORO_EMPTY", error: "没有可朗读的内容" });
  try {
    const audio = await kokoroTts.synthesize(text, { voice: parsed.voice, speed: parsed.speed });
    return writeJson(res, 200, {
      ok: true,
      audioDataUrl: audio.dataUrl,
      cacheHit: audio.cacheHit,
      voice: audio.voice,
      speed: audio.speed,
      engine: "kokoro-82m",
    });
  } catch (err) {
    console.warn("Kokoro TTS unavailable:", err?.message || err);
    return writeJson(res, 503, {
      ok: false,
      code: err?.code || "KOKORO_UNAVAILABLE",
      error: "本地自然语音当前不可用",
      userError: {
        title: "自然语音没有准备完成",
        message: "Kokoro 首次使用需要联网下载本地模型。请检查网络后重试；下载完成后即可离线使用。"
      }
    });
  }
}

async function handleKokoroPrepare(res) {
  try {
    const current = await kokoroTts.prepare();
    return writeJson(res, 200, { ok: true, tts: current });
  } catch (err) {
    return writeJson(res, 503, {
      ok: false,
      code: err?.code || "KOKORO_PREPARE_FAILED",
      error: "自然语音模型没有准备完成",
      userError: {
        title: "自然语音下载失败",
        message: "请确认可以访问模型下载源后再试。已经下载的文件会继续保留，不需要从头安装 Python 环境。"
      }
    });
  }
}

function forward(req, res, body = null) {
  const headers = { ...req.headers };
  delete headers.origin;
  delete headers.host;
  if (Buffer.isBuffer(body)) headers["content-length"] = String(body.length);

  const upstream = http.request({
    host: HOST,
    port: INNER_PORT,
    method: req.method,
    path: req.url,
    headers,
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", err => {
    if (!res.headersSent) {
      writeJson(res, 502, { ok: false, code: "LOCAL_BACKEND_UNAVAILABLE", error: "LexiFlow 本地服务暂时不可用" });
    } else {
      res.end();
    }
    console.error("LexiFlow proxy error:", err.message);
  });

  if (Buffer.isBuffer(body)) upstream.end(body);
  else req.pipe(upstream);
}

async function forwardStatus(req, res) {
  const upstream = http.request({ host: HOST, port: INNER_PORT, method: "GET", path: "/api/status" }, upstreamRes => {
    const chunks = [];
    upstreamRes.on("data", chunk => chunks.push(chunk));
    upstreamRes.on("end", () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const local = ecdict.status();
        const core = coreLexicon.status();
        const phrases = phraseDictionary.status();
        payload.dictionary = {
          ...(payload.dictionary || {}),
          provider: core.available ? "LexiFlow Core + ECDICT + Merriam-Webster 增强" : (local.available ? "ECDICT 本地词典 + Merriam-Webster / AI 例句补全" : "Merriam-Webster's Learner's Dictionary（本地词库未准备）"),
          localAvailable: core.available || local.available,
          localEntries: local.entries,
          localDatabase: local.path ? path.basename(local.path) : "",
          coreAvailable: core.available,
          coreWords: core.words,
          coreSenses: core.senses,
          coreChineseAliases: core.zhAliases,
          coreDatabase: core.path ? path.basename(core.path) : "",
          phraseAvailable: phrases.available,
          phraseEntries: phrases.phrases,
          phraseDatabase: phrases.path ? path.basename(phrases.path) : "",
          fallbackConfigured: Boolean(payload.dictionary?.configured),
          configured: core.available || local.available || Boolean(payload.dictionary?.configured),
          exampleHydration: true,
        };
        payload.tts = kokoroTts.status();
        writeJson(res, upstreamRes.statusCode || 200, payload);
      } catch {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        res.end(Buffer.concat(chunks));
      }
    });
  });
  upstream.on("error", () => writeJson(res, 502, { ok: false, error: "LexiFlow 本地服务暂时不可用" }));
  upstream.end();
}

function createProxy() {
  return http.createServer(async (req, res) => {
    if (!isAllowedOrigin(req)) {
      return writeJson(res, 403, { ok: false, code: "LOCAL_ORIGIN_REQUIRED", error: "请从 LexiFlow 本地页面使用此服务" });
    }

    const url = new URL(req.url, `http://${HOST}:${OUTER_PORT}`);
    if (url.pathname.startsWith("/api/internal/")) {
      return writeJson(res, 404, { ok:false, code:"NOT_FOUND", error:"Not found" });
    }
    if (req.method === "OPTIONS") {
      const origin = String(req.headers.origin || "");
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      return forwardStatus(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/etymology/explain") {
      try {
        const body = await readBody(req, 64 * 1024);
        return await handleEtymologyExplain(res, body);
      } catch (err) {
        console.error("etymology request failed:", err?.message || err);
        return writeJson(res, 503, {
          ok:false,
          code:err?.code || "ETYMOLOGY_LOOKUP_FAILED",
          error:"词源解释暂时没有准备完成",
        });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/dictionary/examples") {
      try {
        const body = await readBody(req);
        return await handleExampleHydration(req, res, body);
      } catch (err) {
        console.error("example hydration request failed:", err?.message || err);
        return writeJson(res, 500, { ok: false, code: "EXAMPLE_HYDRATION_FAILED", error: "例句暂时没有准备完成" });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/tts/kokoro/status") {
      return writeJson(res, 200, { ok: true, tts: kokoroTts.status() });
    }

    if (req.method === "POST" && url.pathname === "/api/tts/kokoro/prepare") {
      return await handleKokoroPrepare(res);
    }

    if (req.method === "POST" && url.pathname === "/api/tts/kokoro") {
      try {
        const body = await readBody(req, 64 * 1024);
        return await handleKokoroTts(res, body);
      } catch (err) {
        return writeJson(res, 500, { ok: false, code: err?.code || "KOKORO_FAILED", error: "本地自然语音没有完成" });
      }
    }

    const interceptable = req.method === "POST" && new Set([
      "/api/search/smart",
      "/api/dictionary/lookup",
      "/api/dictionary/pronunciation",
    ]).has(url.pathname);

    if (interceptable) {
      try {
        const body = await readBody(req);
        if (url.pathname === "/api/dictionary/pronunciation") {
          const pronunciationHandled = await handlePronunciation(res, body);
          if (pronunciationHandled) return;
        }
        const handled = await handleLocalDictionary(req, res, url.pathname, body);
        if (handled) return;
        if (url.pathname === "/api/search/smart") {
          const expressionHandled = await handleEnglishExpression(res, body);
          if (expressionHandled) return;
        }
        return forward(req, res, body);
      } catch (err) {
        console.error("local dictionary proxy failed:", err.message || err);
        return writeJson(res, 400, { ok: false, code: err.code || "LOCAL_LOOKUP_FAILED", error: "本地词典查询没有完成" });
      }
    }

    return forward(req, res);
  });
}

async function startServer() {
  if (proxy?.listening) return { server: proxy, address: startedAddress };

  process.env.LEXIFLOW_PORT = String(INNER_PORT);
  process.env.LEXIFLOW_NO_OPEN = "1";
  inner = require("./server-image-runtime");
  await inner.startServer();

  proxy = createProxy();
  await new Promise((resolve, reject) => {
    const onError = err => {
      proxy.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      proxy.off("error", onError);
      resolve();
    };
    proxy.once("error", onError);
    proxy.once("listening", onListening);
    proxy.listen(OUTER_PORT, HOST);
  });

  startedAddress = `http://${HOST}:${OUTER_PORT}`;
  const local = ecdict.status();
  const core = coreLexicon.status();
  console.log(`LexiFlow dictionary: ${core.available ? `Core local (${core.words || "ready"} words / ${core.zhAliases || 0} zh aliases)` : (local.available ? `ECDICT local (${local.entries || "ready"})` : "MW/Codex fallback")}`);
  return { server: proxy, address: startedAddress };
}

function stopServer() {
  coreLexicon.close();
  ecdict.close();
  try { if (proxy?.listening) proxy.close(); } catch {}
  try { inner?.stopServer?.(); } catch {}
  if (ORIGINAL_PORT === undefined) delete process.env.LEXIFLOW_PORT;
  else process.env.LEXIFLOW_PORT = ORIGINAL_PORT;
  if (ORIGINAL_NO_OPEN === undefined) delete process.env.LEXIFLOW_NO_OPEN;
  else process.env.LEXIFLOW_NO_OPEN = ORIGINAL_NO_OPEN;
}

if (require.main === module) {
  startServer().catch(err => {
    console.error("LexiFlow startup failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { startServer, stopServer };
