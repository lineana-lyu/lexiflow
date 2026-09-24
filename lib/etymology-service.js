"use strict";

const {
  normalizeWord,
  fetchWiktionaryEvidence,
  evidenceFingerprint,
} = require("./etymology-evidence");
const { PersistentEtymologyCache } = require("./etymology-cache");

const EXPLANATION_SCHEMA = "lexiflow-etymology-explanation-v1";
const ALLOWED_CONFIDENCE = new Set(["high", "medium", "insufficient"]);

function clean(value) {
  return String(value ?? "").trim();
}

function extractJson(text) {
  const raw = clean(text);
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(source);
  } catch {}
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function publicSources(sources) {
  return (Array.isArray(sources) ? sources : []).map(source => ({
    id: clean(source.id),
    provider: clean(source.provider),
    title: clean(source.title),
    url: clean(source.url),
    evidenceType: clean(source.evidenceType),
    license: clean(source.license),
    factCount: Array.isArray(source.facts) ? source.facts.length : 0,
  }));
}

function buildPrompt({ word, meaningZh, sources }) {
  const evidence = sources.map(source => ({
    sourceId: source.id,
    provider: source.provider,
    title: source.title,
    facts: (source.facts || []).map(item => item.text),
  }));
  return [
    "你是 LexiFlow 的词源解释器。你只能根据给定的词级词源证据解释，禁止根据拼写自行猜词根。",
    `目标单词：${word}`,
    meaningZh ? `当前学习义：${meaningZh}` : "",
    "",
    "证据（sourceId 必须原样引用）：",
    JSON.stringify(evidence, null, 2),
    "",
    "任务：",
    "1. 判断这些证据是否足以说明该英语单词的历史来源，以及是否足以拆出真实的 prefix/root/suffix。",
    "2. components 只能写证据直接支持的历史构词成分；仅仅字母相似不能算证据。",
    "3. 每个 component 必须给 evidenceSourceIds，且只能引用上面真实存在的 sourceId。",
    "4. 如果来源只支持整词借入、无法可靠拆分，components 必须为空；不要为了教学效果硬拆。",
    "5. explanationZh 用 2-4 句中文解释“为什么这个词发展成今天这个意思”，面向英语学习者，不要编故事。",
    "6. sourcePath 用一行简洁表示历史传播链；不确定的环节不要补。",
    "7. 若证据冲突、过弱或不足，confidence=insufficient，components=[]，explanationZh 只说明暂时无法可靠拆解。",
    "",
    "只输出 JSON，不要 Markdown：",
    JSON.stringify({
      confidence: "high|medium|insufficient",
      sourcePath: "source language → intermediate language → English",
      components: [
        {
          form: "pro-",
          role: "prefix|root|suffix|combining_form",
          meaningZh: "向前",
          sourceLanguage: "Latin",
          sourceForm: "pro",
          evidenceSourceIds: ["mw"],
        },
      ],
      explanationZh: "中文解释",
    }),
  ].filter(Boolean).join("\n");
}

function validateAiExplanation(parsed, sourceIds) {
  if (!parsed || typeof parsed !== "object") {
    const err = new Error("AI returned invalid etymology JSON");
    err.code = "ETYMOLOGY_AI_INVALID";
    throw err;
  }
  const confidence = clean(parsed.confidence).toLowerCase();
  if (!ALLOWED_CONFIDENCE.has(confidence)) {
    const err = new Error("AI etymology confidence is invalid");
    err.code = "ETYMOLOGY_AI_INVALID";
    throw err;
  }

  const explanationZh = clean(parsed.explanationZh);
  const sourcePath = clean(parsed.sourcePath);
  let components = Array.isArray(parsed.components) ? parsed.components : [];

  if (confidence === "insufficient") components = [];

  components = components.slice(0, 8).map((item, index) => {
    const form = clean(item?.form);
    const role = clean(item?.role);
    const meaningZh = clean(item?.meaningZh);
    const sourceLanguage = clean(item?.sourceLanguage);
    const sourceForm = clean(item?.sourceForm);
    const evidenceSourceIds = Array.from(new Set(
      (Array.isArray(item?.evidenceSourceIds) ? item.evidenceSourceIds : [])
        .map(clean)
        .filter(Boolean)
    ));

    if (!form || !meaningZh || !sourceLanguage || !sourceForm) {
      const err = new Error(`AI etymology component ${index + 1} is incomplete`);
      err.code = "ETYMOLOGY_AI_UNGROUNDED";
      throw err;
    }
    if (!evidenceSourceIds.length || evidenceSourceIds.some(id => !sourceIds.has(id))) {
      const err = new Error(`AI etymology component ${index + 1} has no valid evidence trace`);
      err.code = "ETYMOLOGY_AI_UNGROUNDED";
      throw err;
    }
    return {
      form,
      role: role || "root",
      meaningZh,
      sourceLanguage,
      sourceForm,
      evidenceSourceIds,
    };
  });

  if (!explanationZh) {
    const err = new Error("AI etymology explanation is empty");
    err.code = "ETYMOLOGY_AI_INVALID";
    throw err;
  }

  return {
    confidence,
    sourcePath,
    components,
    explanationZh,
  };
}

function createEtymologyService({
  cache = new PersistentEtymologyCache(),
  merriamWebsterProvider = async () => null,
  wiktionaryProvider = (word) => fetchWiktionaryEvidence(word),
  aiRunner = null,
  promptVersion = EXPLANATION_SCHEMA,
} = {}) {
  async function gather(word) {
    const settled = await Promise.allSettled([
      Promise.resolve().then(() => merriamWebsterProvider(word)),
      Promise.resolve().then(() => wiktionaryProvider(word)),
    ]);
    const sources = [];
    const providerErrors = [];
    for (let i = 0; i < settled.length; i++) {
      const name = i === 0 ? "merriam-webster" : "wiktionary";
      const item = settled[i];
      if (item.status === "fulfilled") {
        if (item.value?.facts?.length) sources.push(item.value);
      } else {
        providerErrors.push({
          provider: name,
          code: clean(item.reason?.code) || "ETYMOLOGY_PROVIDER_FAILED",
        });
      }
    }
    return { sources, providerErrors };
  }

  async function explain(inputWord, { meaningZh = "", forceRefresh = false } = {}) {
    const word = normalizeWord(inputWord);
    const normalizedMeaning = clean(meaningZh).replace(/\\s+/g, " ").slice(0, 120);
    const baseKey = `${promptVersion}|${word}|${normalizedMeaning}`;

    if (!forceRefresh) {
      const cached = await cache.get(baseKey);
      if (cached) return { ...cached, cacheHit: true };
    }

    const { sources, providerErrors } = await gather(word);
    if (!sources.length) {
      return {
        schema: EXPLANATION_SCHEMA,
        status: "insufficient_evidence",
        confidence: "insufficient",
        word,
        sourcePath: "",
        components: [],
        explanationZh: "暂时没有取得足够可靠的词级词源证据，因此不进行词根拆解。",
        sources: [],
        providerErrors,
        cacheHit: false,
      };
    }

    if (typeof aiRunner !== "function") {
      return {
        schema: EXPLANATION_SCHEMA,
        status: "evidence_ready_ai_unavailable",
        confidence: "insufficient",
        word,
        sourcePath: "",
        components: [],
        explanationZh: "已经取得词源证据，但当前 AI 解释服务不可用。LexiFlow 不会在没有解释校验的情况下自行猜词根。",
        sources: publicSources(sources),
        providerErrors,
        cacheHit: false,
      };
    }

    const fingerprint = evidenceFingerprint(sources);
    const sourceIds = new Set(sources.map(source => clean(source.id)).filter(Boolean));
    const prompt = buildPrompt({ word, meaningZh: normalizedMeaning, sources });

    let output;
    try {
      output = await aiRunner(prompt, 30000);
    } catch (err) {
      return {
        schema: EXPLANATION_SCHEMA,
        status: "evidence_ready_ai_unavailable",
        confidence: "insufficient",
        word,
        sourcePath: "",
        components: [],
        explanationZh: "已经取得词源证据，但当前 AI 解释服务没有完成。LexiFlow 不会用猜测替代词源证据。",
        sources: publicSources(sources),
        providerErrors: [
          ...providerErrors,
          { provider: "ai", code: clean(err?.code) || "ETYMOLOGY_AI_UNAVAILABLE" },
        ],
        cacheHit: false,
      };
    }

    const validated = validateAiExplanation(extractJson(output), sourceIds);
    const result = {
      schema: EXPLANATION_SCHEMA,
      status: validated.confidence === "insufficient" ? "insufficient_evidence" : "verified_explanation",
      confidence: validated.confidence,
      word,
      sourcePath: validated.sourcePath,
      components: validated.components,
      explanationZh: validated.explanationZh,
      sources: publicSources(sources),
      evidenceFingerprint: fingerprint,
      providerErrors,
      cacheHit: false,
    };

    if (result.status === "verified_explanation") {
      await cache.set(baseKey, result);
    }
    return result;
  }

  return Object.freeze({ explain });
}

module.exports = {
  EXPLANATION_SCHEMA,
  extractJson,
  buildPrompt,
  validateAiExplanation,
  createEtymologyService,
};
