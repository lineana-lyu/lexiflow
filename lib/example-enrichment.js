"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(ROOT, "data");
const RUNTIME_CWD = process.env.LEXIFLOW_RUNTIME_CWD || DATA_DIR;
const CACHE_FILE = path.join(DATA_DIR, "example-cache.json");
const CACHE_SCHEMA = "lexiflow-examples-v2";
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

let cache = null;
let aiQueue = Promise.resolve();

function clean(value) {
  return String(value || "").trim();
}

function normalizeWord(value) {
  return clean(value).toLowerCase();
}

function senseKey(word, sense) {
  return [
    CACHE_SCHEMA,
    normalizeWord(word),
    clean(sense?.pos).toLowerCase(),
    clean(sense?.meaningZh),
    clean(sense?.senseIntentEn).toLowerCase().slice(0, 180),
    clean(sense?.exampleEn).replace(/\s+/g, " ").slice(0, 240),
  ].join("|");
}

async function loadCache() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(await fsp.readFile(CACHE_FILE, "utf8"));
    cache = parsed && parsed.schema === CACHE_SCHEMA && parsed.items && typeof parsed.items === "object"
      ? parsed
      : { schema: CACHE_SCHEMA, items: {} };
  } catch {
    cache = { schema: CACHE_SCHEMA, items: {} };
  }
  return cache;
}

async function saveCache() {
  if (!cache) return;
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const temp = `${CACHE_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(cache, null, 2), "utf8");
  await fsp.rename(temp, CACHE_FILE);
}

async function getCachedExamples(word, senses) {
  const store = await loadCache();
  const results = [];
  for (const sense of Array.isArray(senses) ? senses : []) {
    const hit = store.items[senseKey(word, sense)];
    if (!hit?.exampleEn || !hit?.exampleZh) continue;
    const requestedEnglish = clean(sense?.exampleEn);
    if (requestedEnglish && clean(hit.exampleEn) !== requestedEnglish) continue;
    results.push({
      id: clean(sense.id),
      exampleEn: clean(hit.exampleEn),
      exampleZh: clean(hit.exampleZh),
      source: clean(hit.source) || "cache",
      cacheHit: true,
    });
  }
  return results;
}

async function storeExamples(word, senses, examples) {
  const store = await loadCache();
  const byId = new Map((Array.isArray(senses) ? senses : []).map(sense => [clean(sense.id), sense]));
  let changed = false;
  for (const item of Array.isArray(examples) ? examples : []) {
    const sense = byId.get(clean(item.id));
    if (!sense || !clean(item.exampleEn) || !clean(item.exampleZh)) continue;
    store.items[senseKey(word, sense)] = {
      exampleEn: clean(item.exampleEn),
      exampleZh: clean(item.exampleZh),
      source: clean(item.source) || "ai",
      savedAt: Date.now(),
    };
    changed = true;
  }
  if (changed) await saveCache();
}

function existingFile(candidate) {
  try { return candidate && fs.existsSync(candidate) ? candidate : ""; } catch { return ""; }
}

function windowsCodexCandidates() {
  if (process.platform !== "win32") return [];
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const npmRoot = path.join(appData, "npm");
  const pkgRoot = path.join(npmRoot, "node_modules", "@openai", "codex");
  const vendorX64 = path.join(pkgRoot, "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc");
  const vendorArm64 = path.join(pkgRoot, "node_modules", "@openai", "codex-win32-arm64", "vendor", "aarch64-pc-windows-msvc");
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
  if (configured && existingFile(configured)) return configured;
  for (const candidate of windowsCodexCandidates()) {
    if (existingFile(candidate)) return candidate;
  }
  return "codex";
}

function commandNeedsShell(command) {
  if (process.platform !== "win32") return false;
  if (!path.isAbsolute(command)) return true;
  return /\.(cmd|bat)$/i.test(command);
}

async function loadCodexSettings() {
  try {
    const parsed = JSON.parse(await fsp.readFile(SETTINGS_FILE, "utf8"));
    return {
      model: clean(parsed.codexModel),
      reasoningEffort: clean(parsed.codexReasoningEffort).toLowerCase(),
    };
  } catch {
    return { model: "", reasoningEffort: "" };
  }
}

function extractJson(text) {
  const source = clean(text);
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(source.slice(start, end + 1)); } catch {}
  }
  return null;
}

async function runCodex(prompt, timeoutMs = 18000) {
  const command = resolveCodexExecutable();
  const runtime = await loadCodexSettings();
  const args = ["exec", "--skip-git-repo-check"];
  if (runtime.model) args.push("--model", runtime.model);
  args.push("--config", 'model_reasoning_effort="low"');
  args.push("--sandbox", "read-only");

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: RUNTIME_CWD,
      windowsHide: true,
      shell: commandNeedsShell(command),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(Object.assign(new Error("example enrichment timed out"), { code: "CODEX_TIMEOUT" }));
    }, timeoutMs);

    child.stdout.on("data", chunk => stdout += chunk.toString("utf8"));
    child.stderr.on("data", chunk => stderr += chunk.toString("utf8"));
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
      if (code === 0) return resolve(stdout.trim());
      reject(Object.assign(new Error((stderr || stdout || `Codex exited ${code}`).trim().slice(0, 1200)), { code: "CODEX_EXEC_FAILED" }));
    });
    child.stdin.end(String(prompt || ""), "utf8");
  });
}

function validExampleForWord(example, word) {
  const sentence = clean(example);
  const target = normalizeWord(word);
  if (!sentence || !target) return false;
  if (sentence.length < 12 || sentence.length > 220) return false;
  return sentence.toLowerCase().includes(target);
}

function normalizeGenerated(word, senses, parsed) {
  const requested = new Map((Array.isArray(senses) ? senses : []).map(sense => [clean(sense.id), sense]));
  const out = [];
  for (const raw of Array.isArray(parsed?.senses) ? parsed.senses : []) {
    const id = clean(raw?.id);
    if (!requested.has(id)) continue;
    const exampleEn = clean(raw?.exampleEn);
    const exampleZh = clean(raw?.exampleZh);
    if (!validExampleForWord(exampleEn, word) || !exampleZh) continue;
    out.push({ id, exampleEn, exampleZh, source: "ai-generated", cacheHit: false });
  }
  return out;
}

async function generateExamplesNow(word, senses) {
  const safeWord = normalizeWord(word);
  const safeSenses = (Array.isArray(senses) ? senses : []).slice(0, 4).map(sense => ({
    id: clean(sense.id),
    pos: clean(sense.pos) || "word",
    meaningZh: clean(sense.meaningZh),
    definitionEn: clean(sense.senseIntentEn),
  })).filter(sense => sense.id && sense.meaningZh);
  if (!safeWord || !safeSenses.length) return [];

  const prompt = `你是 LexiFlow 的英语学习例句编辑器。仅在词典没有可用英文例句时，才为指定词义生成一条自然例句。\n\n目标词：${safeWord}\n词义列表：${JSON.stringify(safeSenses)}\n\n要求：\n1. 每个 id 只生成一组英文例句和自然中文翻译。\n2. 英文例句必须严格体现该 id 的 meaningZh/definitionEn，不得串义。\n3. 每个英文例句必须包含目标词 ${safeWord} 的原样拼写（忽略大小写）。\n4. 句子优先 8-16 个英文单词，现代、自然，避免生僻词和词典编辑标记。\n5. 中文翻译要翻译整句，语序自然。\n6. 不要输出 Markdown，只输出 JSON。\n\n输出格式：\n{"senses":[{"id":"原 id","exampleEn":"...","exampleZh":"..."}]}`;

  const stdout = await runCodex(prompt, 18000);
  const parsed = extractJson(stdout);
  if (!parsed) return [];
  return normalizeGenerated(safeWord, safeSenses, parsed);
}

function normalizeTranslations(senses, parsed) {
  const requested = new Map((Array.isArray(senses) ? senses : []).map(sense => [clean(sense.id), sense]));
  const out = [];
  for (const raw of Array.isArray(parsed?.senses) ? parsed.senses : []) {
    const id = clean(raw?.id);
    const sense = requested.get(id);
    if (!sense) continue;
    const exampleEn = clean(sense.exampleEn);
    const exampleZh = clean(raw?.exampleZh);
    if (!exampleEn || !exampleZh) continue;
    out.push({ id, exampleEn, exampleZh, source: "ai-translation", cacheHit: false });
  }
  return out;
}

async function translateExamplesNow(word, senses) {
  const safeWord = normalizeWord(word);
  const safeSenses = (Array.isArray(senses) ? senses : []).slice(0, 4).map(sense => ({
    id: clean(sense.id),
    pos: clean(sense.pos) || "word",
    meaningZh: clean(sense.meaningZh),
    exampleEn: clean(sense.exampleEn),
  })).filter(sense => sense.id && sense.exampleEn);
  if (!safeWord || !safeSenses.length) return [];

  const prompt = `你是 LexiFlow 的英文例句中文翻译器。英文例句来自词典，必须原样保留，绝对不要重写、润色、替换或重新生成英文句子。\n\n目标词：${safeWord}\n待翻译内容：${JSON.stringify(safeSenses)}\n\n要求：\n1. 只输出每个 id 对应的中文整句翻译 exampleZh。\n2. 中文要自然准确，并与 meaningZh/词性对应。\n3. 不要解释，不要添加括号注释，不要改变英文。\n4. 不要输出 Markdown，只输出 JSON。\n\n输出格式：\n{"senses":[{"id":"原 id","exampleZh":"..."}]}`;

  const stdout = await runCodex(prompt, 14000);
  const parsed = extractJson(stdout);
  if (!parsed) return [];
  return normalizeTranslations(safeSenses, parsed);
}

function queue(taskFactory) {
  const task = aiQueue.then(taskFactory, taskFactory);
  aiQueue = task.catch(() => {});
  return task;
}

function generateExamples(word, senses) {
  return queue(() => generateExamplesNow(word, senses));
}

function translateExamples(word, senses) {
  return queue(() => translateExamplesNow(word, senses));
}

module.exports = {
  getCachedExamples,
  storeExamples,
  generateExamples,
  translateExamples,
};
