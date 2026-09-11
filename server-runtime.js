"use strict";

const http = require("http");
const path = require("path");
const ecdict = require("./lib/ecdict");
const coreLexicon = require("./lib/core-lexicon");
const exampleEnrichment = require("./lib/example-enrichment");

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
  const options = {
    sourceQuery: sourceQuery || word,
    autoResolved: Boolean(sourceQuery && sourceQuery.toLowerCase() !== String(word || "").toLowerCase()),
  };
  return coreLexicon.lookupExact(word, mode, options) || ecdict.lookupExact(word, mode, options);
}

function localChineseResult(query) {
  return coreLexicon.lookupChinese(query);
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
      const result = localChineseResult(query);
      if (!result) return false;
      writeJson(res, 200, { ok: true, result: { ...result, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
      console.log(`LexiFlow lookup [${result.lookupPath || "core-zh"}] ${result.lookupMs ?? "?"}ms: ${query} -> ${result.word}`);
      return true;
    }
    const result = /^[A-Za-z][A-Za-z\s'-]*$/.test(query)
      ? localLookupResult(query.toLowerCase(), "primary", query)
      : null;
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
    console.log(`LexiFlow lookup [${result.lookupPath || result.dictionarySource || "local"}] ${result.lookupMs ?? "?"}ms: ${query}`);
    return true;
  }

  if (pathname === "/api/dictionary/lookup") {
    const word = clean(parsed.word).toLowerCase();
    if (!/^[a-z][a-z '-]*$/i.test(word)) return false;
    const mode = parsed.mode === "expanded" ? "expanded" : "primary";
    const result = localLookupResult(word, mode, word);
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true, examplesPending: result.senses?.some(s => !s.exampleEn || !s.exampleZh) } });
    console.log(`LexiFlow lookup [${result.lookupPath || result.dictionarySource || "local"}] ${result.lookupMs ?? "?"}ms: ${word}`);
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

  const local = localLookupResult(word, "primary", word);
  if (local?.audioUrl) {
    writeJson(res, 200, {
      ok: true,
      result: {
        phonetic: local.phonetic || "",
        audioUrl: local.audioUrl,
        audioUrls: Array.isArray(local.audioUrls) ? local.audioUrls : [local.audioUrl],
        pronunciationSource: local.pronunciationSource || "wikimedia-commons",
        exactMatch: true,
        dictionaryAudio: true,
        localLookup: true,
      },
    });
    return true;
  }
  try {
    const remote = await requestInnerJson("/api/dictionary/pronunciation", {
      method: "POST",
      body: { word },
      timeoutMs: 10000,
    });
    const pronunciation = remote.payload?.result;
    const hasAudio = Boolean(clean(pronunciation?.audioUrl) || (Array.isArray(pronunciation?.audioUrls) && pronunciation.audioUrls.some(Boolean)));
    if (remote.status >= 200 && remote.status < 300 && pronunciation && (hasAudio || clean(pronunciation.phonetic))) {
      writeJson(res, 200, {
        ok: true,
        result: {
          ...pronunciation,
          phonetic: clean(pronunciation.phonetic) || local?.phonetic || "",
          dictionaryAudio: hasAudio,
          localLookup: false,
        },
      });
      return true;
    }
  } catch {}

  if (local?.phonetic) {
    writeJson(res, 200, {
      ok: true,
      result: {
        phonetic: local.phonetic,
        audioUrl: "",
        audioUrls: [],
        pronunciationSource: "ecdict-phonetic",
        exactMatch: true,
        dictionaryAudio: false,
        localLookup: true,
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
    }))
    .filter(sense => sense.meaningZh);

  if (!/^[a-z][a-z '-]*$/i.test(word) || !senses.length) {
    return writeJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "缺少有效的单词或词义" });
  }

  const warnings = [];
  const cached = await exampleEnrichment.getCachedExamples(word, senses);
  let combined = mergeExamples(cached);
  const missingAfterCache = senses.filter(sense => !combined.some(item => item.id === sense.id));

  let dictionaryExamples = [];
  if (missingAfterCache.length) {
    dictionaryExamples = await tryDictionaryExamples(word, missingAfterCache);
    if (dictionaryExamples.length) {
      await exampleEnrichment.storeExamples(word, missingAfterCache, dictionaryExamples).catch(() => {});
      combined = mergeExamples(combined, dictionaryExamples);
    }
  }

  const missingAfterDictionary = senses.filter(sense => !combined.some(item => item.id === sense.id));
  if (missingAfterDictionary.length) {
    try {
      const generated = await exampleEnrichment.generateExamples(word, missingAfterDictionary);
      if (generated.length) {
        await exampleEnrichment.storeExamples(word, missingAfterDictionary, generated).catch(() => {});
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
          fallbackConfigured: Boolean(payload.dictionary?.configured),
          configured: core.available || local.available || Boolean(payload.dictionary?.configured),
          exampleHydration: true,
        };
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

    if (req.method === "POST" && url.pathname === "/api/dictionary/examples") {
      try {
        const body = await readBody(req);
        return await handleExampleHydration(req, res, body);
      } catch (err) {
        console.error("example hydration request failed:", err?.message || err);
        return writeJson(res, 500, { ok: false, code: "EXAMPLE_HYDRATION_FAILED", error: "例句暂时没有准备完成" });
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
