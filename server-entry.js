"use strict";

const http = require("http");
const path = require("path");
const ecdict = require("./lib/ecdict");

const HOST = "127.0.0.1";
const OUTER_PORT = Number(process.env.LEXIFLOW_PORT || 4177);
const INNER_PORT = Number(process.env.LEXIFLOW_INNER_PORT || (OUTER_PORT + 1));
const ORIGINAL_PORT = process.env.LEXIFLOW_PORT;

let inner = null;
let proxy = null;
let startedAddress = "";

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

function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return true;
  if (origin === `http://${HOST}:${OUTER_PORT}` || origin === `http://localhost:${OUTER_PORT}`) return true;
  return origin === "null" && req.method === "GET" && req.url === "/api/health";
}

function localLookupResult(word, mode = "primary", sourceQuery = "") {
  return ecdict.lookupExact(word, mode, {
    sourceQuery: sourceQuery || word,
    autoResolved: Boolean(sourceQuery && sourceQuery.toLowerCase() !== String(word || "").toLowerCase()),
  });
}

function localChineseResult(query) {
  const result = ecdict.bestChineseLookup(query);
  if (!result) return null;
  // Exact translation-token matches score well above this threshold. A weak
  // substring result is deliberately handed back to the existing Codex/MW
  // resolver instead of silently choosing an unrelated English headword.
  return Number(result.localSearchScore || 0) >= 400 ? result : null;
}

async function handleLocalDictionary(req, res, pathname, body) {
  if (req.method !== "POST") return false;
  let parsed;
  try {
    parsed = body.length ? JSON.parse(body.toString("utf8")) : {};
  } catch {
    writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
    return true;
  }

  if (pathname === "/api/search/smart") {
    const query = String(parsed.query || "").trim();
    if (!query) return false;
    const hasChinese = /[\u3400-\u9fff]/.test(query);
    const result = hasChinese
      ? localChineseResult(query)
      : /^[A-Za-z][A-Za-z\s'-]*$/.test(query)
        ? localLookupResult(query.toLowerCase(), "primary", query)
        : null;
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true } });
    return true;
  }

  if (pathname === "/api/dictionary/lookup") {
    const word = String(parsed.word || "").trim().toLowerCase();
    if (!/^[a-z][a-z '-]*$/i.test(word)) return false;
    const mode = parsed.mode === "expanded" ? "expanded" : "primary";
    const result = localLookupResult(word, mode, word);
    if (!result) return false;
    writeJson(res, 200, { ok: true, result: { ...result, localLookup: true } });
    return true;
  }

  if (pathname === "/api/dictionary/pronunciation") {
    const word = String(parsed.word || "").trim().toLowerCase();
    if (!/^[a-z][a-z '-]*$/i.test(word)) return false;
    const result = localLookupResult(word, "primary", word);
    if (!result?.phonetic) return false;
    writeJson(res, 200, {
      ok: true,
      result: {
        phonetic: result.phonetic,
        audioUrl: "",
        audioUrls: [],
        pronunciationSource: "ecdict-phonetic",
        exactMatch: true,
        localLookup: true,
      },
    });
    return true;
  }

  return false;
}

function forward(req, res, body) {
  const headers = { ...req.headers };
  delete headers.origin;
  delete headers.host;
  if (body) headers["content-length"] = String(body.length);

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
  if (body?.length) upstream.write(body);
  upstream.end();
}

async function forwardStatus(req, res) {
  const upstream = http.request({ host: HOST, port: INNER_PORT, method: "GET", path: "/api/status" }, upstreamRes => {
    const chunks = [];
    upstreamRes.on("data", chunk => chunks.push(chunk));
    upstreamRes.on("end", () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const local = ecdict.status();
        payload.dictionary = {
          ...(payload.dictionary || {}),
          provider: local.available ? "ECDICT 本地词典 + Merriam-Webster 兜底" : "Merriam-Webster's Learner's Dictionary（ECDICT 未准备）",
          localAvailable: local.available,
          localEntries: local.entries,
          localDatabase: local.path ? path.basename(local.path) : "",
          fallbackConfigured: Boolean(payload.dictionary?.configured),
          configured: local.available || Boolean(payload.dictionary?.configured),
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

    const interceptable = req.method === "POST" && new Set([
      "/api/search/smart",
      "/api/dictionary/lookup",
      "/api/dictionary/pronunciation",
    ]).has(url.pathname);

    if (interceptable) {
      try {
        const body = await readBody(req);
        const handled = await handleLocalDictionary(req, res, url.pathname, body);
        if (handled) return;
        return forward(req, res, body);
      } catch (err) {
        console.error("local dictionary proxy failed:", err.message || err);
        return writeJson(res, 400, { ok: false, code: err.code || "LOCAL_LOOKUP_FAILED", error: "本地词典查询没有完成" });
      }
    }

    return forward(req, res, null);
  });
}

async function startServer() {
  if (proxy?.listening) return { server: proxy, address: startedAddress };

  process.env.LEXIFLOW_PORT = String(INNER_PORT);
  // Require after setting the internal port because server.js reads it at module load.
  inner = require("./server");
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
  console.log(`LexiFlow dictionary: ${local.available ? `ECDICT local (${local.entries || "ready"})` : "MW/Codex fallback"}`);
  return { server: proxy, address: startedAddress };
}

function stopServer() {
  ecdict.close();
  try { if (proxy?.listening) proxy.close(); } catch {}
  try { inner?.stopServer?.(); } catch {}
  if (ORIGINAL_PORT === undefined) delete process.env.LEXIFLOW_PORT;
  else process.env.LEXIFLOW_PORT = ORIGINAL_PORT;
}

if (require.main === module) {
  startServer().catch(err => {
    console.error("LexiFlow startup failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { startServer, stopServer };
