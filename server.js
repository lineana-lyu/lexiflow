const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { spawn, spawnSync, exec } = require("child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.LEXIFLOW_PORT || 4177);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const GENERATED_DIR = path.join(ROOT, "generated");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const CODEX_CONFIG = path.join(os.homedir(), ".codex", "config.toml");
const CODEX_AUTH = path.join(os.homedir(), ".codex", "auth.json");

const LOOKUP_CACHE_FILE = path.join(DATA_DIR, "dictionary-cache.json");
const LOOKUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKUP_CACHE_SCHEMA = "v4.1";
let lookupCache = null;

async function loadLookupCache() {
  if (lookupCache) return lookupCache;
  try {
    const parsed = JSON.parse(await fsp.readFile(LOOKUP_CACHE_FILE, "utf8"));
    lookupCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    lookupCache = {};
  }
  return lookupCache;
}

async function saveLookupCache() {
  if (!lookupCache) return;
  try {
    await fsp.writeFile(LOOKUP_CACHE_FILE, JSON.stringify(lookupCache, null, 2), "utf8");
  } catch (err) {
    console.warn("dictionary cache write failed:", err.message);
  }
}

function dictionaryCacheKey(word, mode, settings) {
  return [
    LOOKUP_CACHE_SCHEMA,
    String(word || "").toLowerCase(),
    mode || "primary",
    settings.codexModel || "",
    settings.codexReasoningEffort || "",
  ].join("|");
}

async function getCachedLookup(key) {
  const cache = await loadLookupCache();
  const hit = cache[key];
  if (!hit) return null;
  if (Date.now() - Number(hit.savedAt || 0) > LOOKUP_CACHE_TTL_MS) {
    delete cache[key];
    void saveLookupCache();
    return null;
  }
  return hit.result || null;
}

async function setCachedLookup(key, result) {
  const cache = await loadLookupCache();
  cache[key] = { savedAt: Date.now(), result };
  await saveLookupCache();
}


fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(GENERATED_DIR, { recursive: true });

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function loadSettings() {
  const defaults = {
    merriamWebsterLearnersKey: "",
    codexModel: "",
    codexReasoningEffort: ""
  };
  try {
    const parsed = JSON.parse(await fsp.readFile(SETTINGS_FILE, "utf8"));
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

async function saveSettings(next) {
  const allowedEfforts = new Set(["", "low", "medium", "high", "xhigh", "max"]);
  const requestedEffort = String(next.codexReasoningEffort || "").trim().toLowerCase();

  const clean = {
    merriamWebsterLearnersKey: String(next.merriamWebsterLearnersKey || "").trim(),
    codexModel: String(next.codexModel || "").trim(),
    codexReasoningEffort: allowedEfforts.has(requestedEffort) ? requestedEffort : "",
  };

  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${SETTINGS_FILE}.tmp`;
  try {
    await fsp.writeFile(tempFile, JSON.stringify(clean, null, 2), "utf8");
    await fsp.rename(tempFile, SETTINGS_FILE);
  } catch (err) {
    try { await fsp.unlink(tempFile); } catch {}
    const wrapped = new Error("本地设置文件无法写入");
    wrapped.code = "SETTINGS_WRITE_FAILED";
    wrapped.cause = err;
    throw wrapped;
  }
  return clean;
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 6) return "••••••";
  return "••••••••" + key.slice(-4);
}

function existingFile(candidate) {
  try {
    return candidate && fs.existsSync(candidate) ? candidate : "";
  } catch {
    return "";
  }
}

function windowsCodexCandidates() {
  if (process.platform !== "win32") return [];

  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const npmRoot = path.join(appData, "npm");
  const pkgRoot = path.join(npmRoot, "node_modules", "@openai", "codex");
  const vendorX64 = path.join(
    pkgRoot,
    "node_modules",
    "@openai",
    "codex-win32-x64",
    "vendor",
    "x86_64-pc-windows-msvc"
  );
  const vendorArm64 = path.join(
    pkgRoot,
    "node_modules",
    "@openai",
    "codex-win32-arm64",
    "vendor",
    "aarch64-pc-windows-msvc"
  );

  return [
    process.env.CODEX_CLI_PATH || "",
    path.join(vendorX64, "bin", "codex.exe"),
    path.join(vendorX64, "codex", "codex.exe"),
    path.join(vendorArm64, "bin", "codex.exe"),
    path.join(vendorArm64, "codex", "codex.exe"),
    path.join(npmRoot, "codex.cmd"),
    path.join(npmRoot, "codex.exe"),
    path.join(os.homedir(), ".local", "bin", "codex.exe"),
  ].filter(Boolean);
}

function resolveCodexExecutable() {
  const configured = process.env.CODEX_CLI_PATH;
  if (configured && existingFile(configured)) {
    return { command: configured, source: "CODEX_CLI_PATH" };
  }

  for (const candidate of windowsCodexCandidates()) {
    if (existingFile(candidate)) {
      return { command: candidate, source: "windows-common-path" };
    }
  }

  // Final fallback: let PATH/shell resolve the command.
  return { command: "codex", source: "PATH" };
}

function detectCodexExecutable() {
  return resolveCodexExecutable().command;
}

function commandNeedsShell(command) {
  if (process.platform !== "win32") return false;
  if (!path.isAbsolute(command)) return true;
  return /\.(cmd|bat)$/i.test(command);
}

function runSync(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    shell: commandNeedsShell(command),
    timeout: 8000,
  });
}

function parseCodexConfig() {
  let configFound = false;
  let model = "";
  let provider = "";
  const profileModels = [];

  try {
    const text = fs.readFileSync(CODEX_CONFIG, "utf8");
    configFound = true;

    const modelMatch = text.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
    const providerMatch = text.match(/^\s*model_provider\s*=\s*["']([^"']+)["']/m);
    model = modelMatch ? modelMatch[1] : "";
    provider = providerMatch ? providerMatch[1] : "";

    // Collect model entries from profiles/custom provider sections as selectable
    // runtime candidates. Authentication data is never read here.
    for (const match of text.matchAll(/^\s*model\s*=\s*["']([^"']+)["']/gm)) {
      const value = String(match[1] || "").trim();
      if (value) profileModels.push(value);
    }
  } catch {}

  return {
    configFound,
    model,
    provider,
    profileModels: Array.from(new Set(profileModels)),
  };
}

function codexModelOptions(cfg, selectedModel = "") {
  const known = [
    "gpt-6-astra",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ];
  return Array.from(new Set([
    selectedModel,
    cfg?.model || "",
    ...(cfg?.profileModels || []),
    ...known,
  ].filter(Boolean)));
}

function codexStatus() {
  const resolved = resolveCodexExecutable();
  const executable = resolved.command;
  const probe = runSync(executable, ["--version"]);
  const cfg = parseCodexConfig();

  // Important security boundary:
  // We only check whether auth.json exists. We never read, parse, copy,
  // log, expose, or export its contents. Codex CLI owns authentication.
  const authFound = fs.existsSync(CODEX_AUTH);

  return {
    executable: path.isAbsolute(executable) ? executable : "codex (PATH)",
    executableSource: resolved.source,
    cliAvailable: probe.status === 0,
    version: probe.status === 0 ? String(probe.stdout || probe.stderr || "").trim() : "",
    probeError: probe.status === 0 ? "" : String(probe.stderr || probe.error?.message || probe.stdout || "").trim().slice(0, 800),
    authPath: CODEX_AUTH,
    authFound,
    configPath: CODEX_CONFIG,
    configFound: cfg.configFound,
    model: cfg.model,
    provider: cfg.provider,
    profileModels: cfg.profileModels || [],
  };
}

function spawnCodex(args, options = {}) {
  const executable = detectCodexExecutable();
  return spawn(executable, args, {
    cwd: options.cwd || ROOT,
    windowsHide: true,
    shell: commandNeedsShell(executable),
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
}

function friendlyError(err, context = "general") {
  const raw = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "UNKNOWN_ERROR");

  if (code === "SETTINGS_WRITE_FAILED") {
    return {
      code: "SETTINGS_WRITE_FAILED",
      title: "设置没有保存成功",
      message: "LexiFlow 当前无法写入本地设置文件。请确认解压后的文件夹不是只读目录，然后重新启动 LexiFlow 再保存。",
    };
  }
  if (code === "CODEX_TIMEOUT" || /timed?\s*out|超时/.test(raw)) {
    return {
      code: "TIMEOUT",
      title: context === "image" ? "图片生成时间过长" : "AI 响应时间过长",
      message: context === "image"
        ? "这次图片生成超过等待时间。你可以直接重试、简化场景描述，或上传本地图片继续学习。"
        : "这次 AI 响应时间过长。请稍后重试；当前学习内容不会丢失。",
    };
  }
  if (/too\s*many\s*requests|rate.?limit|429/.test(raw)) {
    return {
      code: "RATE_LIMIT",
      title: "当前 AI 请求较多",
      message: "当前服务请求较多或临时达到使用限制。请稍等一会再试，不需要修改你的学习内容。",
    };
  }
  if (/image_gen.*not.*available|image generation.*not.*available|tool.*not.*available|image_generation.*not.*enabled/.test(raw)) {
    return {
      code: "IMAGE_CAPABILITY_UNAVAILABLE",
      title: "当前 Codex 暂不能生成图片",
      message: "当前 Codex 会话没有可用的图片生成能力。你仍可以上传本地图片或跳过视觉联想，不影响后续学习。",
    };
  }
  if (/401|unauthorized|login|auth|authentication|sign.?in/.test(raw)) {
    return {
      code: "AUTH_REQUIRED",
      title: "Codex 登录状态需要检查",
      message: "本机 Codex 目前无法完成认证。请先确认 Codex CLI 能正常使用，再回到 LexiFlow 重试。",
    };
  }
  if (/model.*not found|unsupported model|does not support|invalid model/.test(raw)) {
    return {
      code: "MODEL_UNAVAILABLE",
      title: "当前模型不可用于这个任务",
      message: "你选择的模型当前无法完成这项操作。请到设置切换模型后重试。",
    };
  }
  if (code === "CODEX_NOT_AVAILABLE" || code === "CODEX_SPAWN_FAILED") {
    return {
      code: "CODEX_UNAVAILABLE",
      title: "没有连接到本机 Codex",
      message: "LexiFlow 没有成功启动本机 Codex。请确认 Codex CLI 已安装并能在命令行正常运行。",
    };
  }
  if (context === "dictionary") {
    return {
      code: code || "DICTIONARY_ERROR",
      title: "暂时没有查到结果",
      message: "词典查询暂时没有完成。请检查网络后重试，或换一个拼写再搜索。",
    };
  }
  return {
    code: code || "UNKNOWN_ERROR",
    title: "这次操作没有完成",
    message: "当前操作暂时没有完成。你的已有学习内容不会丢失，可以稍后重试。",
  };
}

async function runCodex(
  prompt,
  {
    cwd = ROOT,
    timeoutMs = 90000,
    workspaceWrite = false,
    reasoningEffortOverride = null,
  } = {}
) {
  const status = codexStatus();
  if (!status.cliAvailable) {
    throw Object.assign(new Error("Codex CLI 不可用"), { code: "CODEX_NOT_AVAILABLE" });
  }

  const runtime = await loadSettings();

  // Official Codex exec semantics:
  // - model override: --model <MODEL>
  // - reasoning override: --config model_reasoning_effort="<EFFORT>"
  // - prompt is written to stdin rather than appended as a positional argument.
  const args = ["exec", "--skip-git-repo-check"];

  if (runtime.codexModel) {
    args.push("--model", runtime.codexModel);
  }
  const effectiveReasoningEffort =
    reasoningEffortOverride === null
      ? runtime.codexReasoningEffort
      : String(reasoningEffortOverride || "").trim().toLowerCase();

  if (effectiveReasoningEffort) {
    args.push("--config", `model_reasoning_effort="${effectiveReasoningEffort}"`);
  }

  args.push("--sandbox", workspaceWrite ? "workspace-write" : "read-only");

  return await new Promise((resolve, reject) => {
    const child = spawnCodex(args, { cwd });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(Object.assign(new Error("Codex 调用超时"), { code: "CODEX_TIMEOUT" }));
    }, timeoutMs);

    child.stdout.on("data", d => stdout += d.toString("utf8"));
    child.stderr.on("data", d => stderr += d.toString("utf8"));

    child.on("error", err => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(Object.assign(err, { code: "CODEX_SPAWN_FAILED" }));
    });

    child.on("close", code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          runtime: {
            model: runtime.codexModel || status.model || "",
            reasoningEffort: effectiveReasoningEffort || "",
          },
        });
        return;
      }

      const safeMessage = (stderr || stdout || `Codex exited ${code}`)
        .trim()
        .slice(0, 1800);

      const err = new Error(safeMessage);
      err.code = "CODEX_EXEC_FAILED";
      reject(err);
    });

    // Critical v3.3 fix: Codex exec receives prompt via stdin.
    try {
      child.stdin.write(String(prompt || ""), "utf8");
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        child.kill();
        reject(Object.assign(err, { code: "CODEX_STDIN_FAILED" }));
      }
    }
  });
}

let lastCodexRuntimeTest = {
  status: "not-tested",
  at: "",
  message: "",
  model: "",
  reasoningEffort: ""
};

function extractJson(text) {
  const source = String(text || "").trim();
  try { return JSON.parse(source); } catch {}

  const candidates = [];
  const objectStart = source.indexOf("{");
  const objectEnd = source.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(source.slice(objectStart, objectEnd + 1));
  }
  const arrayStart = source.indexOf("[");
  const arrayEnd = source.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(source.slice(arrayStart, arrayEnd + 1));
  }
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
  }
  throw new Error("CODEX_JSON_PARSE_FAILED");
}

function cleanMwText(value) {
  return String(value || "")
    .replace(/\{bc\}/g, "")
    .replace(/\{\/?(it|wi|b|sc|inf|sup)\}/g, "")
    .replace(/\{sx\|([^|}]+)[^}]*\}/g, "$1")
    .replace(/\{d_link\|([^|}]+)[^}]*\}/g, "$1")
    .replace(/\{a_link\|([^|}]+)[^}]*\}/g, "$1")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectExamples(node, out = []) {
  if (!node || out.length >= 12) return out;
  if (Array.isArray(node)) {
    if (node.length >= 2 && node[0] === "vis" && Array.isArray(node[1])) {
      for (const item of node[1]) {
        if (item && item.t) out.push(cleanMwText(item.t));
        if (out.length >= 12) break;
      }
      return out;
    }
    for (const item of node) collectExamples(item, out);
    return out;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) collectExamples(value, out);
  }
  return out;
}

function normalizeIpa(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/\s+/g, " ");
}

function mwPronunciationToApproxIpa(value) {
  return String(value || "")
    .trim()
    .replace(/-/g, "")
    .replace(/ä/g, "ɑ")
    .replace(/ȯ/g, "ɔ")
    .replace(/ü/g, "u")
    .replace(/ā/g, "eɪ")
    .replace(/ē/g, "i")
    .replace(/ī/g, "aɪ")
    .replace(/ō/g, "oʊ")
    .replace(/au̇/g, "aʊ")
    .replace(/oi/g, "ɔɪ")
    .replace(/ər/g, "ɚ")
    .replace(/\s+/g, " ");
}

function pronunciationFromEntry(entry) {
  const pronunciations = Array.isArray(entry?.hwi?.prs) ? entry.hwi.prs : [];
  if (!pronunciations.length) return "";
  const withIpa = pronunciations.find(pr => pr && pr.ipa);
  if (withIpa?.ipa) return normalizeIpa(withIpa.ipa);
  const withMw = pronunciations.find(pr => pr && pr.mw);
  if (withMw?.mw) return normalizeIpa(mwPronunciationToApproxIpa(withMw.mw));
  return "";
}

function audioUrlFromEntry(entry) {
  const pronunciations = entry?.hwi?.prs || [];
  const audio = pronunciations.find(p => p?.sound?.audio)?.sound?.audio;
  if (!audio) return "";
  let subdir = audio[0]?.toLowerCase() || "number";
  if (audio.startsWith("bix")) subdir = "bix";
  else if (audio.startsWith("gg")) subdir = "gg";
  else if (/^[^a-z]/i.test(audio)) subdir = "number";
  return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdir}/${audio}.mp3`;
}

function normalizeHeadword(value) {
  return cleanMwText(value)
    .split(":")[0]
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function entryMatchesQuery(entry, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;

  const headword = normalizeHeadword(entry?.meta?.id || entry?.hwi?.hw || "");
  if (headword === q) return true;

  const stems = Array.isArray(entry?.meta?.stems) ? entry.meta.stems : [];
  return stems.some(stem => normalizeHeadword(stem) === q);
}


function englishIntentTokens(value) {
  const stop = new Set([
    "a","an","the","to","of","for","and","or","with","that","this","is","are","be","used","use","thing","something"
  ]);
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 2 && !stop.has(x));
}

function intentDefinitionScore(definition, intentEn) {
  const intent = new Set(englishIntentTokens(intentEn));
  if (!intent.size) return 0;
  const defTokens = englishIntentTokens(definition);
  let score = 0;
  for (const token of defTokens) {
    if (intent.has(token)) score += 4;
    else {
      for (const wanted of intent) {
        if ((token.startsWith(wanted) || wanted.startsWith(token)) && Math.min(token.length, wanted.length) >= 4) {
          score += 2;
          break;
        }
      }
    }
  }
  return score;
}

function selectIntentDefinition(sourceEntries, query, intentEn) {
  if (!intentEn) return null;
  let best = null;
  for (const entry of sourceEntries) {
    const shortdefs = Array.isArray(entry?.shortdef) ? entry.shortdef.filter(Boolean) : [];
    const examples = collectExamples(entry);
    for (let i = 0; i < shortdefs.length; i++) {
      const definitionEn = cleanMwText(shortdefs[i]);
      const score = intentDefinitionScore(definitionEn, intentEn);
      if (!best || score > best.score) {
        best = {
          entry,
          definitionEn,
          exampleEn: examples[i] || examples[0] || "",
          score,
        };
      }
    }
  }
  return best && best.score > 0 ? best : null;
}

function normalizeMerriamWebster(payload, query, mode = "primary", intentEn = "") {
  if (!Array.isArray(payload)) return { word: query, suggestions: [] };
  if (payload.length && typeof payload[0] === "string") {
    return { word: query, suggestions: payload.slice(0, 8) };
  }

  const exactEntries = payload.filter(
    entry => entry && typeof entry === "object" && entryMatchesQuery(entry, query)
  );

  // If Merriam-Webster returned only a close lexical entry, keep the first object
  // rather than mixing in compounds/phrases such as "deck chair".
  const sourceEntries = exactEntries.length
    ? exactEntries
    : payload.filter(entry => entry && typeof entry === "object").slice(0, 1);

  const candidates = [];
  const usedPos = new Set();

  const intentMatch = selectIntentDefinition(sourceEntries, query, intentEn);
  if (mode === "primary" && intentMatch) {
    const entry = intentMatch.entry;
    const headword = normalizeHeadword(entry?.meta?.id || entry?.hwi?.hw || query) || query;
    candidates.push({
      id: `${headword}-${cleanMwText(entry.fl || "word")}-intent`,
      word: headword,
      pos: cleanMwText(entry.fl || "word"),
      definitionEn: intentMatch.definitionEn,
      exampleEn: intentMatch.exampleEn,
      pronunciation: pronunciationFromEntry(entry),
      audioUrl: audioUrlFromEntry(entry),
      sourceOrder: 0,
    });
  }

  for (const entry of sourceEntries) {
    if (mode === "primary" && candidates.length) break;
    const shortdefs = Array.isArray(entry.shortdef) ? entry.shortdef.filter(Boolean) : [];
    if (!shortdefs.length) continue;

    const headword = normalizeHeadword(entry?.meta?.id || entry?.hwi?.hw || query) || query;
    const pos = cleanMwText(entry.fl || "word");
    const posKey = pos.toLowerCase();
    const pronunciation = pronunciationFromEntry(entry);
    const audioUrl = audioUrlFromEntry(entry);
    const examples = collectExamples(entry);

    // Product choice for the learning MVP:
    // do NOT expose every dictionary sub-sense.
    // Use the first short definition of an exact headword entry as the core sense.
    candidates.push({
      id: `${headword}-${pos || "word"}-${candidates.length}`,
      word: headword || query,
      pos,
      definitionEn: cleanMwText(shortdefs[0]),
      exampleEn: examples[0] || "",
      pronunciation,
      audioUrl,
      sourceOrder: candidates.length,
    });

    if (mode === "primary") break;

    // Expanded view stays intentionally small: one core sense per POS, max 3.
    usedPos.add(posKey);
    if (candidates.length >= 3) break;
  }

  // In expanded mode, try to add distinct parts of speech only.
  if (mode === "expanded" && candidates.length < 3) {
    for (const entry of sourceEntries) {
      const shortdefs = Array.isArray(entry.shortdef) ? entry.shortdef.filter(Boolean) : [];
      if (!shortdefs.length) continue;

      const pos = cleanMwText(entry.fl || "word");
      const posKey = pos.toLowerCase();
      if (usedPos.has(posKey)) continue;

      const headword = normalizeHeadword(entry?.meta?.id || entry?.hwi?.hw || query) || query;
      const examples = collectExamples(entry);

      candidates.push({
        id: `${headword}-${pos || "word"}-${candidates.length}`,
        word: headword || query,
        pos,
        definitionEn: cleanMwText(shortdefs[0]),
        exampleEn: examples[0] || "",
        pronunciation: pronunciationFromEntry(entry),
        audioUrl: audioUrlFromEntry(entry),
        sourceOrder: candidates.length,
      });
      usedPos.add(posKey);
      if (candidates.length >= 3) break;
    }
  }

  const totalExactEntries = sourceEntries.reduce((count, entry) => {
    const shortdefs = Array.isArray(entry.shortdef) ? entry.shortdef.filter(Boolean) : [];
    return count + (shortdefs.length ? 1 : 0);
  }, 0);

  return {
    word: candidates[0]?.word || query,
    phonetic: candidates[0]?.pronunciation || "",
    audioUrl: candidates[0]?.audioUrl || "",
    entries: candidates,
    suggestions: [],
    mode,
    hasMore: totalExactEntries > candidates.length,
  };
}


function normalizeChineseMeaningForDedupe(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，,。.!！?？:：]/g, "")
    .replace(/[；;、/]+/g, "；")
    .replace(/^有(?=[\u4e00-\u9fff]{2,}$)/, "")
    .replace(/；+$/g, "");
}

function mergeDuplicateLearningSenses(senses) {
  const result = [];
  const byMeaning = new Map();

  for (const sense of Array.isArray(senses) ? senses : []) {
    const key = normalizeChineseMeaningForDedupe(sense.meaningZh);

    if (!key) {
      result.push(sense);
      continue;
    }

    const existing = byMeaning.get(key);
    if (!existing) {
      const copy = { ...sense };
      byMeaning.set(key, copy);
      result.push(copy);
      continue;
    }

    // Same Chinese learning meaning = one learning card.
    // Preserve POS information on that single card.
    const positions = new Set(
      String(existing.pos || "")
        .split(/[·/|]+/)
        .map(x => x.trim())
        .filter(Boolean)
    );
    for (const pos of String(sense.pos || "")
      .split(/[·/|]+/)
      .map(x => x.trim())
      .filter(Boolean)) {
      positions.add(pos);
    }
    existing.pos = Array.from(positions).join(" · ") || existing.pos || sense.pos || "word";

    // Keep the first complete natural example pair.
    if ((!existing.exampleEn || !existing.exampleZh) && sense.exampleEn && sense.exampleZh) {
      existing.exampleEn = sense.exampleEn;
      existing.exampleZh = sense.exampleZh;
    }
  }

  return result;
}

async function enrichDictionaryWithCodex(normalized) {
  if (!normalized.entries?.length) return normalized;

  const compact = normalized.entries.map(e => ({
    id: e.id,
    word: e.word,
    pos: e.pos,
    definitionEn: e.definitionEn,
    exampleEn: e.exampleEn,
  }));

  const prompt = `你是中国用户英语单词学习卡片的“快速释义整理器”。
下面数据来自 Merriam-Webster Learner's Dictionary。

目标不是做完整词典，而是做“学习卡片”：
- 只处理输入中已经筛选出的少量核心义项。
- meaningZh 必须是“词典式中文词义”，不是对英文定义的整句翻译。
- 中文释义必须短、常用、自然，优先 1~6 个汉字或短词组。
- 不要添加“有、能够、用于、负责、表示、指的是”等解释性句式，除非它们本身就是不可缺少的词义。
- 对简单高频词，直接给学习者最常背的中文对应词。

明确示例：
- work（verb，do a job）→ “工作”，不要写“有工作”
- work（noun，job/labor）→ “工作”，不要写“工作这件事”
- chair（noun，seat）→ “椅子”
- book（noun）→ “书；书籍”
- run（verb，move quickly on foot）→ “跑；奔跑”

- 不新增词义，不解释词源，不输出英文释义。

每个 id 原样返回。
exampleEn：
- 输入已有例句则优先保留；
- 如果没有，生成一句简短、自然、只体现当前词义的例句。
exampleZh：准确、自然地翻译最终 exampleEn。

在输出前请在内部做一次自检：
- meaningZh 是否准确对应 definitionEn 和最终 exampleEn；
- 是否把定义误翻成了另一种词义；
- 是否属于现代通用英语学习者值得学习的常用义；
- 稀有、古旧、非常专业、只存在于固定短语中的义项，标记为不推荐。

只输出 JSON：
{"senses":[{"id":"...","meaningZh":"...","exampleEn":"...","exampleZh":"...","commonForLearner":true,"confidence":0.95,"senseIntentEn":"用简短英文说明这个具体词义","avoidVisualEn":["最容易混淆但不属于本义的视觉对象"]}]}

commonForLearner：
- true = 现代通用、适合普通英语学习者；
- false = 稀有、古旧、专业、固定搭配衍生义，不应默认作为学习卡片。

confidence：
- 0 到 1，表示中文词义与英文定义/例句的一致性置信度。

输入：
${JSON.stringify(compact)}`;

  try {
    const result = await runCodex(prompt, {
      timeoutMs: 30000,
      workspaceWrite: false,
      reasoningEffortOverride: "low",
    });
    const parsed = extractJson(result.stdout);
    const map = new Map((parsed.senses || []).map(x => [x.id, x]));

    normalized.senses = mergeDuplicateLearningSenses(
      normalized.entries.map(entry => {
        const ai = map.get(entry.id) || {};
        return {
          id: entry.id,
          pos: entry.pos,
          meaningZh: String(ai.meaningZh || "").trim() || "中文释义生成失败，请手动编辑",
          exampleEn: String(ai.exampleEn || entry.exampleEn || "").trim(),
          exampleZh: String(ai.exampleZh || "").trim(),
          commonForLearner: ai.commonForLearner !== false,
          translationConfidence: Number.isFinite(Number(ai.confidence))
            ? Math.max(0, Math.min(1, Number(ai.confidence)))
            : null,
          senseIntentEn: String(ai.senseIntentEn || entry.definitionEn || "").trim(),
          avoidVisualEn: Array.isArray(ai.avoidVisualEn)
            ? ai.avoidVisualEn.slice(0, 4).map(String).map(x => x.trim()).filter(Boolean)
            : [],
        };
      })
    );

    if (normalized.mode === "expanded" && normalized.senses.length > 1) {
      const commonOnly = normalized.senses.filter(sense => sense.commonForLearner !== false);
      if (commonOnly.length) {
        normalized.senses = commonOnly;
      }
    }

    normalized.translationNeedsReview = normalized.senses.some(
      sense =>
        sense.translationConfidence !== null &&
        sense.translationConfidence < 0.72
    );

    normalized.aiEnriched = true;
  } catch (err) {
    normalized.senses = mergeDuplicateLearningSenses(
      normalized.entries.map(entry => ({
        id: entry.id,
        pos: entry.pos,
        meaningZh: "AI 中文释义暂不可用，请手动编辑",
        exampleEn: entry.exampleEn,
        exampleZh: "",
      }))
    );
    normalized.aiEnriched = false;
    normalized.aiWarning = err.code || "CODEX_FAILED";
    normalized.aiError = String(err.message || "").slice(0, 600);
  }

  delete normalized.entries;
  return normalized;
}

function levenshteinDistance(a, b) {
  const s = Array.from(String(a || "").toLowerCase());
  const t = Array.from(String(b || "").toLowerCase());
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cur.length; j++) prev[j] = cur[j];
  }
  return prev[t.length];
}

async function localChineseCandidates(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const cache = await loadLookupCache();
  const hits = [];
  const seen = new Set();

  for (const entry of Object.values(cache || {})) {
    const result = entry?.result;
    if (!result?.word || !Array.isArray(result?.senses)) continue;
    for (const sense of result.senses) {
      const meaning = String(sense?.meaningZh || "").trim();
      if (!meaning) continue;
      const direct = meaning.includes(q) || q.includes(meaning);
      const distance = levenshteinDistance(meaning.replace(/[；;、，,\s]/g, ""), q.replace(/[；;、，,\s]/g, ""));
      if (direct || distance <= (q.length <= 3 ? 1 : 2)) {
        const word = String(result.word).toLowerCase();
        if (!seen.has(word)) {
          seen.add(word);
          hits.push({ word, reason: meaning, source: "local-cache" });
        }
      }
    }
  }
  return hits.slice(0, 5);
}

async function resolveChineseSearch(query) {
  const q = String(query || "").trim();
  const local = await localChineseCandidates(q);

  const prompt = `你是中文到英语的词汇检索器，服务于中国用户背单词。
用户可能输入正确中文、少量错别字，或一个日常概念。

用户输入：${q}

任务：
1. 纠正明显中文错别字。
2. 只选一个最可能、最常用的现代英语单词作为 primary。
3. 如果中文本身有歧义，优先中国用户在现代日常语境中最常指的含义。
   例如“键盘”默认理解为电脑键盘，不是钢琴键盘；除非用户明确写“钢琴键盘/琴键”。
4. meaningZh 要简短，适合单词卡。
5. intentEn 用英文准确描述本次具体词义，便于与词典定义对齐。
6. avoidVisualEn 写最容易被图片模型误画成的其它含义；没有则空数组。
7. 直接生成一组自然、简单、明确体现该词义的中英文例句。
8. alternatives 只用于后台容错，最多 3 个；用户不需要先选择。

只输出 JSON：
{
  "normalizedChinese":"纠正后的中文",
  "primary":{
    "word":"english",
    "meaningZh":"简短中文",
    "intentEn":"precise sense in English",
    "avoidVisualEn":["confusing visual sense"],
    "exampleEn":"natural example",
    "exampleZh":"自然中文翻译",
    "confidence":0.95
  },
  "alternatives":[{"word":"english","meaningZh":"中文"}]
}`;

  const result = await runCodex(prompt, {
    timeoutMs: 18000,
    workspaceWrite: false,
    reasoningEffortOverride: "low",
  });
  const parsed = extractJson(result.stdout);
  const primary = parsed?.primary || {};
  const word = String(primary.word || local?.[0]?.word || "").trim().toLowerCase();
  if (!/^[a-z][a-z '-]*$/i.test(word)) {
    const err = new Error("没有识别到合适的英文单词");
    err.code = "SEARCH_RESOLUTION_FAILED";
    throw err;
  }

  return {
    normalizedChinese: String(parsed.normalizedChinese || q),
    primary: {
      word,
      meaningZh: String(primary.meaningZh || local?.[0]?.reason || q).trim(),
      intentEn: String(primary.intentEn || "").trim(),
      avoidVisualEn: Array.isArray(primary.avoidVisualEn)
        ? primary.avoidVisualEn.slice(0, 4).map(String).map(x => x.trim()).filter(Boolean)
        : [],
      exampleEn: String(primary.exampleEn || "").trim(),
      exampleZh: String(primary.exampleZh || "").trim(),
      confidence: Number.isFinite(Number(primary.confidence)) ? Number(primary.confidence) : null,
    },
    alternatives: Array.isArray(parsed.alternatives)
      ? parsed.alternatives.slice(0, 3).map(item => ({
          word: String(item.word || "").trim().toLowerCase(),
          meaningZh: String(item.meaningZh || "").trim(),
        })).filter(item => /^[a-z][a-z '-]*$/i.test(item.word))
      : [],
    source: local.length ? "local-assisted" : "codex-resolver",
  };
}

async function merriamWebsterPronunciation(word) {
  const settings = await loadSettings();
  const key = String(settings.merriamWebsterLearnersKey || "").trim();
  if (!key) {
    const err = new Error("请先在设置中配置 Merriam-Webster Learner's Dictionary API Key");
    err.code = "DICTIONARY_KEY_MISSING";
    throw err;
  }
  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers: { "Accept":"application/json", "User-Agent":"LexiFlow-Standalone-MVP/3.9" } });
  if (!response.ok) {
    const err = new Error(`Merriam-Webster 发音查询失败：HTTP ${response.status}`);
    err.code = "DICTIONARY_HTTP_ERROR";
    throw err;
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) return { phonetic:"", audioUrl:"" };
  const exactEntries = payload.filter(entry => entry && typeof entry === "object" && entryMatchesQuery(entry, word));
  const source = exactEntries[0] || payload.find(entry => entry && typeof entry === "object");
  if (!source) return { phonetic:"", audioUrl:"" };
  return { phonetic: pronunciationFromEntry(source), audioUrl: audioUrlFromEntry(source) };
}

async function merriamWebsterLookup(word, mode = "primary", options = {}) {
  const settings = await loadSettings();
  const key = String(settings.merriamWebsterLearnersKey || "").trim();
  if (!key) {
    const err = new Error("请先在设置中配置 Merriam-Webster Learner's Dictionary API Key");
    err.code = "DICTIONARY_KEY_MISSING";
    throw err;
  }

  const safeMode = mode === "expanded" ? "expanded" : "primary";
  const intentEn = String(options.intentEn || "").trim();
  const provided = options.learningContent || null;
  const intentCachePart = intentEn ? intentEn.toLowerCase().slice(0, 80) : "";
  const cacheKey = dictionaryCacheKey(`${word}|${intentCachePart}`, safeMode, settings);
  const cached = await getCachedLookup(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "LexiFlow/4.2" },
  });

  if (!response.ok) {
    const err = new Error(`Merriam-Webster 请求失败：HTTP ${response.status}`);
    err.code = "DICTIONARY_HTTP_ERROR";
    throw err;
  }

  const payload = await response.json();
  const normalized = normalizeMerriamWebster(payload, word, safeMode, intentEn);
  if (normalized.suggestions?.length) return normalized;

  let result;
  if (provided && normalized.entries?.length) {
    const entry = normalized.entries[0];
    result = {
      word: normalized.word,
      phonetic: normalized.phonetic,
      audioUrl: normalized.audioUrl,
      mode: safeMode,
      hasMore: normalized.hasMore,
      suggestions: [],
      aiEnriched: true,
      senses: [{
        id: entry.id,
        pos: entry.pos,
        meaningZh: String(provided.meaningZh || "").trim(),
        exampleEn: String(provided.exampleEn || entry.exampleEn || "").trim(),
        exampleZh: String(provided.exampleZh || "").trim(),
        commonForLearner: true,
        translationConfidence: Number.isFinite(Number(provided.confidence)) ? Number(provided.confidence) : null,
        senseIntentEn: intentEn || entry.definitionEn || "",
        avoidVisualEn: Array.isArray(options.avoidVisualEn) ? options.avoidVisualEn : [],
      }],
      sourceQuery: String(options.sourceQuery || "").trim(),
      normalizedQuery: String(options.normalizedQuery || "").trim(),
      autoResolved: Boolean(options.sourceQuery),
      alternatives: Array.isArray(options.alternatives) ? options.alternatives : [],
    };
  } else {
    result = await enrichDictionaryWithCodex(normalized);
    result.sourceQuery = String(options.sourceQuery || "").trim();
    result.normalizedQuery = String(options.normalizedQuery || "").trim();
    result.autoResolved = Boolean(options.sourceQuery && options.sourceQuery.toLowerCase() !== word.toLowerCase());
  }

  result.cacheHit = false;
  await setCachedLookup(cacheKey, result);
  return result;
}

async function smartLookup(query) {
  const q = String(query || "").trim();
  if (!q) {
    const err = new Error("请输入要查找的内容");
    err.code = "EMPTY_QUERY";
    throw err;
  }

  const hasChinese = /[\u3400-\u9fff]/.test(q);
  if (hasChinese) {
    const resolved = await resolveChineseSearch(q);
    let result = await merriamWebsterLookup(resolved.primary.word, "primary", {
      intentEn: resolved.primary.intentEn,
      learningContent: resolved.primary,
      avoidVisualEn: resolved.primary.avoidVisualEn,
      sourceQuery: q,
      normalizedQuery: resolved.normalizedChinese,
      alternatives: resolved.alternatives,
    });
    if (result.suggestions?.length) {
      const corrected = String(result.suggestions[0] || "").trim().toLowerCase();
      if (corrected) {
        result = await merriamWebsterLookup(corrected, "primary", {
          intentEn: resolved.primary.intentEn,
          learningContent: { ...resolved.primary, word: corrected },
          avoidVisualEn: resolved.primary.avoidVisualEn,
          sourceQuery: q,
          normalizedQuery: resolved.normalizedChinese,
          alternatives: resolved.alternatives,
        });
      }
    }
    return result;
  }

  if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(q)) {
    const err = new Error("暂时无法识别这个输入");
    err.code = "INVALID_SEARCH_QUERY";
    throw err;
  }

  let result = await merriamWebsterLookup(q.toLowerCase(), "primary", { sourceQuery: q });
  if (result.suggestions?.length) {
    const corrected = String(result.suggestions[0] || "").trim().toLowerCase();
    if (corrected) {
      result = await merriamWebsterLookup(corrected, "primary", { sourceQuery: q });
      result.autoCorrectedFrom = q;
    }
  }
  return result;
}

async function sentenceFeedback(body) {
  const word = String(body.word || "").trim();
  const meaningZh = String(body.meaningZh || "").trim();
  const sentence = String(body.sentence || "").trim();
  if (!word || !sentence) throw new Error("INVALID_INPUT");

  const prompt = `你是面向中国英语学习者的造句反馈助手。
目标词：${word}
本次中文词义：${meaningZh}
学生句子：${sentence}

请判断：
- 是否正确使用了“本次词义”
- 语法是否基本正确
- 搭配是否自然
- 是否需要最小修改

只输出 JSON：
{"level":"good|warn","title":"一句中文结论","tips":["最多3条中文建议"],"suggestion":"必要时给出一个最小修改后的英文句子，否则为空字符串"}

不要用苛刻的母语者标准；只指出对学习最有价值的问题。`;

  const result = await runCodex(prompt, { timeoutMs: 70000, workspaceWrite: false });
  const parsed = extractJson(result.stdout);
  return {
    level: parsed.level === "good" ? "good" : "warn",
    title: String(parsed.title || "AI 已完成反馈"),
    tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3).map(String) : [],
    suggestion: String(parsed.suggestion || ""),
    provider: "codex-local",
  };
}

function safeFileStem(input) {
  return String(input || "word").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "word";
}

async function generateVisual(body) {
  const word = String(body.word || "").trim();
  const meaningZh = String(body.meaningZh || "").trim();
  const exampleEn = String(body.exampleEn || "").trim();
  const visualNote = String(body.visualNote || "").trim();
  const sourceQuery = String(body.sourceQuery || "").trim();
  const senseIntentEn = String(body.senseIntentEn || "").trim();
  const avoidVisualEn = Array.isArray(body.avoidVisualEn)
    ? body.avoidVisualEn.slice(0, 5).map(String).map(x => x.trim()).filter(Boolean)
    : [];

  if (!word) throw new Error("INVALID_INPUT");

  const fileName = `${Date.now()}-${safeFileStem(word)}.png`;
  const absolutePath = path.join(GENERATED_DIR, fileName);

  const scene = visualNote
    ? `用户指定场景（最高优先级，必须严格实现）：${visualNote}`
    : `用户未指定场景：请根据当前词义设计一个自然、具体、生活化的记忆场景。`;

  const prompt = `$imagegen
请立即生成图片，不要先解释或讨论。

为英语学习软件 LexiFlow 生成一张视觉联想记忆图。

目标单词：${word}
用户最初搜索：${sourceQuery || "未提供"}
当前中文词义：${meaningZh || "未提供"}
这个词义的准确英文语义：${senseIntentEn || "请严格依据当前中文词义和例句判断"}
参考例句：${exampleEn || "未提供"}
${avoidVisualEn.length ? `明确不要画成：${avoidVisualEn.join("；")}` : ""}
${scene}

硬规则：
1. 用户场景优先级最高。人物、地点、动作、物体和关系都必须保留。
1.1 如果没有精确英文语义元数据，则把“当前中文词义”视为最重要的消歧信息，并优先现代日常最常见含义。例如“键盘”默认是电脑输入设备，除非词义、例句或用户描述明确指向钢琴/乐器键盘。
2. 当前词义只用于防止画错义项。
3. 不要把具体名词默认做成孤立商品图；除非用户明确要求。
4. 不要文字、字幕、单词、中文释义、logo、水印。
5. 如果场景说“女生在图书馆看书”，必须同时有女生、图书馆和看书动作，不能只画一本书。
6. 画面自然、明确、适合记忆。

请使用当前环境可用的图片生成能力，并把最终 PNG 直接保存到：
${absolutePath}

只生成这个 PNG，不修改其它项目文件。`;

  // Image generation is a visual task rather than a deep reasoning task.
  // Use low reasoning to reduce Codex planning latency while preserving the user's model choice.
  await runCodex(prompt, {
    cwd: GENERATED_DIR,
    timeoutMs: 150000,
    workspaceWrite: true,
    reasoningEffortOverride: "low",
  });

  if (!fs.existsSync(absolutePath)) {
    const err = new Error("当前 Codex 配置没有生成可用图片文件。你仍可上传本地图或跳过。");
    err.code = "IMAGE_NOT_CREATED";
    throw err;
  }

  return {
    url: `/generated/${encodeURIComponent(fileName)}`,
    sceneMode: visualNote ? "user-directed" : "auto",
    visualNote,
  };
}

async function dictionaryTest() {
  const settings = await loadSettings();
  const key = String(settings.merriamWebsterLearnersKey || "").trim();
  if (!key) return { ok: false, message: "尚未配置 API Key" };
  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/apple?key=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
    const data = await response.json();
    const valid = Array.isArray(data) && data.some(x => x && typeof x === "object");
    return { ok: valid, message: valid ? "Learner's Dictionary Key 可用" : "返回内容异常，请确认 Key 类型" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  })[ext] || "application/octet-stream";
}

async function serveFile(res, baseDir, relativePath) {
  const decoded = decodeURIComponent(relativePath);
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(baseDir, safe);
  if (!filePath.startsWith(baseDir)) return sendText(res, 403, "Forbidden");
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error("not file");
    res.writeHead(200, { "Content-Type": mimeType(filePath), "Content-Length": stat.size });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "lexiflow-local",
        version: "4.2",
        address: `http://${HOST}:${PORT}`,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      const settings = await loadSettings();
      const codex = codexStatus();
      return sendJson(res, 200, {
        ok: true,
        dictionary: {
          provider: "Merriam-Webster's Learner's Dictionary",
          configured: Boolean(settings.merriamWebsterLearnersKey),
          maskedKey: maskKey(settings.merriamWebsterLearnersKey),
        },
        codex: {
          ...codex,
          modelOptions: codexModelOptions(codex, settings.codexModel || ""),
          selectedModel: settings.codexModel || "",
          selectedReasoningEffort: settings.codexReasoningEffort || "",
          effectiveModel: settings.codexModel || codex.model || "",
          textAI: codex.cliAvailable ? "cli-detected" : "cli-unavailable",
          imageAI: codex.cliAvailable ? "runtime-dependent" : "cli-unavailable",
          runtimeTest: lastCodexRuntimeTest,
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/settings/dictionary") {
      const body = await readJsonBody(req);
      const key = String(body.apiKey || "").trim();
      if (!key) return sendJson(res, 400, { ok: false, error: "API Key 不能为空" });
      try {
        const current = await loadSettings();
        const saved = await saveSettings({ ...current, merriamWebsterLearnersKey: key });
        return sendJson(res, 200, { ok: true, maskedKey: maskKey(saved.merriamWebsterLearnersKey) });
      } catch (err) {
        console.error("settings save failed:", err?.cause?.message || err?.message || err);
        const friendly = friendlyError(err, "settings");
        return sendJson(res, 500, { ok: false, code: friendly.code, error: friendly.message, userError: friendly });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/settings/codex") {
      const body = await readJsonBody(req);
      const current = await loadSettings();

      const model = String(body.model || "").trim();
      const reasoningEffort = String(body.reasoningEffort || "").trim().toLowerCase();
      const allowed = new Set(["", "low", "medium", "high", "xhigh", "max"]);

      if (!allowed.has(reasoningEffort)) {
        return sendJson(res, 400, { ok: false, error: "不支持的思考强度" });
      }

      const saved = await saveSettings({
        ...current,
        codexModel: model,
        codexReasoningEffort: reasoningEffort,
      });

      // A saved runtime selection is not the same thing as a successful exec.
      lastCodexRuntimeTest = {
        status: "not-tested",
        at: "",
        message: "配置已更新，请重新检查 AI 连接",
        model: saved.codexModel,
        reasoningEffort: saved.codexReasoningEffort,
      };

      return sendJson(res, 200, {
        ok: true,
        codexModel: saved.codexModel,
        codexReasoningEffort: saved.codexReasoningEffort,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/dictionary/test") {
      const result = await dictionaryTest();
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === "POST" && url.pathname === "/api/search/smart") {
      const body = await readJsonBody(req);
      const query = String(body.query || "").trim();
      try {
        const result = await smartLookup(query);
        return sendJson(res, 200, { ok: true, result });
      } catch (err) {
        console.error("smart lookup failed:", err?.message || err);
        const friendly = err.code === "DICTIONARY_KEY_MISSING"
          ? { code: "DICTIONARY_KEY_MISSING", title: "需要配置词典", message: "请先在设置中填写 Merriam-Webster Learner's Dictionary Key。" }
          : friendlyError(err, "search");
        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, {
          ok: false,
          code: friendly.code,
          error: friendly.message,
          userError: friendly,
        });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/search/resolve") {
      const body = await readJsonBody(req);
      const query = String(body.query || "").trim();
      if (!query) {
        return sendJson(res, 400, { ok: false, code: "EMPTY_QUERY", error: "请输入要查找的内容" });
      }
      try {
        const result = await resolveChineseSearch(query);
        return sendJson(res, 200, { ok: true, result });
      } catch (err) {
        console.error("search resolver failed:", err?.message || err);
        const friendly = friendlyError(err, "search");
        return sendJson(res, 502, { ok: false, code: friendly.code, error: friendly.message, userError: friendly });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/dictionary/pronunciation") {
      const body = await readJsonBody(req);
      const word = String(body.word || "").trim().toLowerCase();
      if (!/^[a-z][a-z '-]*$/i.test(word)) {
        return sendJson(res, 400, { ok:false, code:"INVALID_WORD", error:"请输入英文单词或短语" });
      }
      try {
        const result = await merriamWebsterPronunciation(word);
        return sendJson(res, 200, { ok:true, result });
      } catch (err) {
        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, { ok:false, code:err.code || "PRONUNCIATION_LOOKUP_FAILED", error:err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/dictionary/lookup") {
      const body = await readJsonBody(req);
      const word = String(body.word || "").trim().toLowerCase();
      if (!/^[a-z][a-z '-]*$/i.test(word)) {
        return sendJson(res, 400, { ok: false, code: "INVALID_WORD", error: "请输入英文单词或短语" });
      }
      try {
        const mode = body.mode === "expanded" ? "expanded" : "primary";
        const result = await merriamWebsterLookup(word, mode);
        return sendJson(res, 200, { ok: true, result });
      } catch (err) {
        console.error("dictionary lookup failed:", err?.message || err);
        const friendly = err.code === "DICTIONARY_KEY_MISSING"
          ? { code: "DICTIONARY_KEY_MISSING", title: "需要配置词典 Key", message: "请先到设置中配置 Merriam-Webster Learner's Dictionary API Key。" }
          : friendlyError(err, "dictionary");
        return sendJson(res, err.code === "DICTIONARY_KEY_MISSING" ? 400 : 502, {
          ok: false, code: friendly.code, error: friendly.message, userError: friendly
        });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/ai/test") {
      const started = Date.now();
      try {
        const result = await runCodex(
          '只输出这一行，不要解释：LEXIFLOW_CODEX_OK',
          { timeoutMs: 60000, workspaceWrite: false }
        );

        const ok = String(result.stdout || "").includes("LEXIFLOW_CODEX_OK");
        const runtime = await loadSettings();
        lastCodexRuntimeTest = {
          status: ok ? "passed" : "failed",
          at: new Date().toISOString(),
          message: ok ? `AI 连接正常（${Date.now() - started}ms）` : "AI 已连接，但返回内容异常",
          model: runtime.codexModel || codexStatus().model || "",
          reasoningEffort: runtime.codexReasoningEffort || "",
        };

        return sendJson(res, ok ? 200 : 502, {
          ok,
          test: lastCodexRuntimeTest,
        });
      } catch (err) {
        const runtime = await loadSettings();
        lastCodexRuntimeTest = {
          status: "failed",
          at: new Date().toISOString(),
          message: String(err.message || "AI 连接检查失败").slice(0, 1200),
          model: runtime.codexModel || codexStatus().model || "",
          reasoningEffort: runtime.codexReasoningEffort || "",
        };

        return sendJson(res, 502, {
          ok: false,
          code: err.code || "CODEX_TEST_FAILED",
          error: lastCodexRuntimeTest.message,
          test: lastCodexRuntimeTest,
        });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/ai/text") {
      const body = await readJsonBody(req);
      try {
        const feedback = await sentenceFeedback(body);
        return sendJson(res, 200, { ok: true, feedback });
      } catch (err) {
        console.error("text AI failed:", err?.message || err);
        const friendly = friendlyError(err, "text");
        return sendJson(res, 502, { ok: false, code: friendly.code, error: friendly.message, userError: friendly });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/ai/image") {
      const body = await readJsonBody(req);
      try {
        const image = await generateVisual(body);
        return sendJson(res, 200, { ok: true, image });
      } catch (err) {
        console.error("image AI failed:", err?.message || err);
        const friendly = friendlyError(err, "image");
        return sendJson(res, 502, { ok: false, code: friendly.code, error: friendly.message, userError: friendly });
      }
    }

    if (req.method === "GET" && url.pathname.startsWith("/generated/")) {
      return serveFile(res, GENERATED_DIR, url.pathname.slice("/generated/".length));
    }

    if (req.method === "GET") {
      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      return serveFile(res, PUBLIC_DIR, requested);
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { ok: false, error: "本地服务发生错误", detail: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const address = `http://${HOST}:${PORT}`;
  console.log("");
  console.log("LexiFlow 本地服务 v4.2 已启动");
  console.log(`地址: ${address}`);
  console.log(`Codex 认证: ${CODEX_AUTH}`);
  console.log(`Codex 可选配置: ${CODEX_CONFIG}`);
  console.log("关闭此窗口即可停止本地服务。");
  console.log("");

  if (process.platform === "win32" && process.env.LEXIFLOW_NO_OPEN !== "1") {
    exec(`start "" "${address}"`);
  }
});
