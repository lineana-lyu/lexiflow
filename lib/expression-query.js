"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || path.join(ROOT, "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const DEFAULT_MODEL = "gpt-5.6-luna";

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function classifyEnglishQuery(value) {
  const input = clean(value);
  if (!input || /[\u3400-\u9fff]/.test(input)) return "other";
  const words = input.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
  if (!words.length) return "other";
  if (words.length === 1 && /^[A-Za-z][A-Za-z'-]*$/.test(input)) return "word";
  if (/[.!?][\"')\]]*$/.test(input) || words.length >= 7) return "sentence";
  return "phrase";
}

function loadRuntimeSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return {
      model: clean(parsed?.codexModel) || DEFAULT_MODEL,
      effort: clean(parsed?.codexReasoningEffort).toLowerCase() || "low",
    };
  } catch {
    return { model: DEFAULT_MODEL, effort: "low" };
  }
}

function existingFile(candidate) {
  try { return Boolean(candidate && fs.existsSync(candidate)); } catch { return false; }
}

function windowsCandidates() {
  if (process.platform !== "win32") return [];
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const npmRoot = path.join(appData, "npm");
  const pkgRoot = path.join(npmRoot, "node_modules", "@openai", "codex");
  const x64 = path.join(pkgRoot, "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc");
  const arm64 = path.join(pkgRoot, "node_modules", "@openai", "codex-win32-arm64", "vendor", "aarch64-pc-windows-msvc");
  return [
    process.env.CODEX_CLI_PATH || "",
    path.join(x64, "bin", "codex.exe"),
    path.join(x64, "codex", "codex.exe"),
    path.join(arm64, "bin", "codex.exe"),
    path.join(arm64, "codex", "codex.exe"),
    path.join(npmRoot, "codex.cmd"),
    path.join(npmRoot, "codex.exe"),
  ].filter(Boolean);
}

function resolveCodexExecutable() {
  for (const candidate of windowsCandidates()) if (existingFile(candidate)) return candidate;
  return process.env.CODEX_CLI_PATH || "codex";
}

function commandNeedsShell(command) {
  return process.platform === "win32" && (!path.isAbsolute(command) || /\.(cmd|bat)$/i.test(command));
}

function extractJson(text) {
  const source = clean(text);
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
  throw Object.assign(new Error("EXPRESSION_JSON_PARSE_FAILED"), { code: "EXPRESSION_JSON_PARSE_FAILED" });
}

function runCodexJson(prompt, timeoutMs = 22000) {
  const runtime = loadRuntimeSettings();
  const command = resolveCodexExecutable();
  const args = ["exec", "--skip-git-repo-check"];
  if (runtime.model) args.push("--model", runtime.model);
  if (runtime.effort) args.push("--config", `model_reasoning_effort=\"${runtime.effort}\"`);
  args.push("--sandbox", "read-only");

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: DATA_DIR,
      windowsHide: true,
      shell: commandNeedsShell(command),
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(Object.assign(new Error("表达查询超时"), { code: "EXPRESSION_TIMEOUT" }));
    }, timeoutMs);

    child.stdout.on("data", chunk => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", chunk => { stderr += chunk.toString("utf8"); });
    child.on("error", err => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(Object.assign(err, { code: "EXPRESSION_AI_UNAVAILABLE" }));
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        return reject(Object.assign(new Error(clean(stderr || stdout || `Codex exited ${code}`)), { code: "EXPRESSION_AI_FAILED" }));
      }
      try { resolve(extractJson(stdout)); }
      catch (err) { reject(err); }
    });
    try {
      child.stdin.write(String(prompt || ""), "utf8");
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        try { child.kill(); } catch {}
        reject(Object.assign(err, { code: "EXPRESSION_AI_STDIN_FAILED" }));
      }
    }
  });
}

function includesExactExpression(sentence, expression) {
  const source = clean(sentence).toLowerCase();
  const target = clean(expression).toLowerCase();
  return Boolean(source && target && source.includes(target));
}

function safeId(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "expression";
}

async function resolveEnglishExpression(query) {
  const sourceQuery = clean(query);
  const queryKind = classifyEnglishQuery(sourceQuery);
  if (!new Set(["phrase", "sentence"]).has(queryKind)) return null;

  const prompt = queryKind === "phrase"
    ? `你是 LexiFlow 的英语表达查询器。用户输入的是一个英文短语或固定表达，不要拆成单词让用户选择。\n\n输入：${sourceQuery}\n\n任务：\n1. 把整个输入作为一个表达理解。\n2. normalized 必须保持这个表达本身，只允许规范大小写、空格和末尾标点，不得换成某个单词。\n3. meaningZh 给出最常用、最自然的简短中文释义。若输入是短语动词、习语或固定搭配，必须优先给惯用义，禁止把组成单词逐字拼成表面意思；例如 hang out 的常用义是“闲逛、一起待着”，不是“挂出”。\n4. intentEn 用简短英文解释这个表达的准确意思。\n5. exampleEn 给一个自然简短例句，必须原样包含 normalized。\n6. exampleZh 翻译 exampleEn。\n7. 如果它不是常见固定短语，也仍按用户输入的完整表达解释，不要拆词。\n\n只输出 JSON：{"normalized":"...","meaningZh":"...","intentEn":"...","exampleEn":"...","exampleZh":"...","confidence":0.95}`
    : `你是 LexiFlow 的英语短句查询器。用户输入的是一个完整短句。绝对不要把句子拆成若干单词再让用户选择。\n\n句子：${sourceQuery}\n\n任务：\n1. translationZh：整句自然中文翻译。\n2. primaryExpression：从原句中提取最值得英语学习者掌握的一个词或短语。word 必须是原句中连续出现的原文片段（忽略大小写），优先 2~5 词的搭配/固定表达；如果没有高价值短语，可以选一个高价值单词。\n3. primaryExpression.meaningZh 是该表达在这句话里的简短中文意思。\n4. intentEn 用简短英文准确说明该表达在当前句中的意思。\n5. alternatives 最多 2 个，也必须是原句里的连续原文片段，不要返回无关单词。\n\n只输出 JSON：{"translationZh":"...","primaryExpression":{"word":"...","meaningZh":"...","pos":"word|phrase","intentEn":"...","confidence":0.95},"alternatives":[{"word":"...","meaningZh":"..."}]}`;

  const parsed = await runCodexJson(prompt, queryKind === "sentence" ? 24000 : 20000);

  if (queryKind === "phrase") {
    const normalized = clean(parsed.normalized || sourceQuery).replace(/[.!?]+$/g, "");
    if (!normalized || normalized.split(/\s+/).length < 2) {
      throw Object.assign(new Error("没有得到完整短语结果"), { code: "EXPRESSION_INVALID_RESULT" });
    }
    const exampleEn = clean(parsed.exampleEn);
    if (!includesExactExpression(exampleEn, normalized)) {
      throw Object.assign(new Error("短语例句没有包含完整目标表达"), { code: "EXPRESSION_INVALID_EXAMPLE" });
    }
    return {
      word: normalized,
      phonetic: "",
      audioUrl: "",
      audioUrls: [],
      pronunciationSource: "",
      dictionaryExact: false,
      phraseCard: true,
      queryKind: "phrase",
      mode: "primary",
      hasMore: false,
      suggestions: [],
      aiEnriched: true,
      sourceQuery,
      normalizedQuery: normalized,
      autoResolved: normalized.toLowerCase() !== sourceQuery.replace(/[.!?]+$/g, "").toLowerCase(),
      alternatives: [],
      senses: [{
        id: `phrase-${safeId(normalized)}`,
        pos: "phrase",
        meaningZh: clean(parsed.meaningZh) || "短语",
        exampleEn,
        exampleZh: clean(parsed.exampleZh),
        commonForLearner: true,
        translationConfidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : null,
        senseIntentEn: clean(parsed.intentEn),
        avoidVisualEn: [],
      }],
    };
  }

  const translationZh = clean(parsed.translationZh);
  const primary = parsed.primaryExpression || {};
  const word = clean(primary.word);
  if (!word || !includesExactExpression(sourceQuery, word)) {
    throw Object.assign(new Error("短句没有提取到可靠的学习表达"), { code: "EXPRESSION_INVALID_TARGET" });
  }
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.slice(0, 2).map(item => ({ word: clean(item?.word), meaningZh: clean(item?.meaningZh) })).filter(item => item.word && includesExactExpression(sourceQuery, item.word) && item.word.toLowerCase() !== word.toLowerCase())
    : [];

  return {
    word,
    phonetic: "",
    audioUrl: "",
    audioUrls: [],
    pronunciationSource: "",
    dictionaryExact: false,
    phraseCard: /\s/.test(word),
    sentenceQuery: true,
    queryKind: "sentence",
    mode: "primary",
    hasMore: false,
    suggestions: [],
    aiEnriched: true,
    sourceQuery,
    normalizedQuery: translationZh,
    autoResolved: true,
    sourceSentence: { text: sourceQuery, translationZh },
    alternatives,
    senses: [{
      id: `sentence-expression-${safeId(word)}`,
      pos: clean(primary.pos) || (/\s/.test(word) ? "phrase" : "word"),
      meaningZh: clean(primary.meaningZh) || translationZh,
      exampleEn: sourceQuery,
      exampleZh: translationZh,
      commonForLearner: true,
      translationConfidence: Number.isFinite(Number(primary.confidence)) ? Number(primary.confidence) : null,
      senseIntentEn: clean(primary.intentEn),
      avoidVisualEn: [],
    }],
  };
}

module.exports = { classifyEnglishQuery, resolveEnglishExpression };
