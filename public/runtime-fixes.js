(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const SCENE_HISTORY_KEY = "lexiflow-ai-scene-history-v1";
  const PROMPT_HISTORY_KEY = "lexiflow-ai-prompt-history-v1";
  const MAX_HISTORY = 4;

  function endpointOf(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    } catch {
      return "";
    }
  }

  function parseBody(init) {
    if (!init || typeof init.body !== "string") return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function responseWithJson(original, data) {
    const headers = new Headers(original.headers || {});
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(data), {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  }

  function requestWithJson(init, body) {
    return {
      ...(init || {}),
      headers: { "Content-Type": "application/json", ...((init && init.headers) || {}) },
      body: JSON.stringify(body),
    };
  }

  function isChinese(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function compactChinese(value) {
    return String(value || "").trim().replace(/[。；;，,]+$/g, "");
  }

  function preferredChineseMeaning(query, result) {
    const normalized = compactChinese(result?.normalizedQuery || "");
    const source = compactChinese(query);
    if (normalized && isChinese(normalized) && normalized.length <= 12) return normalized;
    if (source && isChinese(source) && source.length <= 12) return source;
    return "";
  }

  function normalizeChineseLookup(data, body) {
    if (!data?.result || !isChinese(body?.word)) return data;
    const shortMeaning = preferredChineseMeaning(body.word, data.result);
    if (!shortMeaning) return data;

    const senses = Array.isArray(data.result.senses) ? data.result.senses : [];
    data.result.senses = senses.map((sense, index) => {
      if (index !== 0) return sense;
      const original = compactChinese(sense?.meaningZh || "");
      if (!original || original === shortMeaning) return { ...sense, meaningZh: shortMeaning };
      return {
        ...sense,
        meaningZh: shortMeaning,
        glossZh: sense.glossZh || original,
      };
    });
    data.result.displayMeaningZh = shortMeaning;
    return data;
  }

  function loadHistory(storageKey) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveHistory(storageKey, history) {
    try { sessionStorage.setItem(storageKey, JSON.stringify(history)); } catch {}
  }

  const sceneHistory = loadHistory(SCENE_HISTORY_KEY);
  const promptHistory = loadHistory(PROMPT_HISTORY_KEY);

  function historyKey(body) {
    return `${String(body?.word || "").trim().toLowerCase()}|${String(body?.meaningZh || "").trim()}`;
  }

  function remember(history, storageKey, key, value) {
    const text = String(value || "").trim();
    if (!text) return;
    const next = Array.isArray(history[key]) ? history[key].filter(x => x !== text) : [];
    next.unshift(text);
    history[key] = next.slice(0, MAX_HISTORY);
    saveHistory(storageKey, history);
  }

  function normalizeForSimilarity(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s，。！？；：、“”‘’（）()\-—_]/g, "")
      .trim();
  }

  function bigrams(value) {
    const text = normalizeForSimilarity(value);
    if (text.length < 2) return text ? [text] : [];
    const out = [];
    for (let i = 0; i < text.length - 1; i++) out.push(text.slice(i, i + 2));
    return out;
  }

  function similarity(a, b) {
    const aa = bigrams(a), bb = bigrams(b);
    if (!aa.length || !bb.length) return 0;
    const counts = new Map();
    aa.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
    let overlap = 0;
    bb.forEach(x => {
      const count = counts.get(x) || 0;
      if (count > 0) { overlap++; counts.set(x, count - 1); }
    });
    return (2 * overlap) / (aa.length + bb.length);
  }

  function tooSimilar(value, previousValues, threshold = 0.7) {
    const text = String(value || "").trim();
    if (!text) return true;
    return (previousValues || []).some(prev => similarity(text, prev) >= threshold);
  }

  function sceneIsConcrete(scene) {
    const text = String(scene || "").trim();
    if (text.length < 18) return false;
    const generic = [
      /放进一个你熟悉.*生活场景/,
      /围绕.+设计一个.*生活化.*场景/,
      /一个你熟悉.*具体.*生活场景/,
      /^把.+放进.+场景[。.]?$/,
    ];
    return !generic.some(re => re.test(text));
  }

  function composeSceneAvoidance(body, previousValues, failedCandidate = "") {
    const old = [body?.previousScene, ...(previousValues || []), failedCandidate]
      .map(x => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!old.length) return "";
    return `${old.join("；")}。刷新要求：必须换一个明显不同的地点、人物动作或时间情境，不能只改写句子；场景必须包含具体环境、具体物体和明确动作。`;
  }

  async function robustVisualScene(input, init, body) {
    const key = historyKey(body);
    const known = Array.isArray(sceneHistory[key]) ? [...sceneHistory[key]] : [];
    if (body.previousScene) known.unshift(body.previousScene);
    let lastResponse = null;
    let failedCandidate = "";

    for (let attempt = 0; attempt < 3; attempt++) {
      const nextBody = {
        ...body,
        previousScene: attempt === 0 && !body.previousScene
          ? ""
          : composeSceneAvoidance(body, known, failedCandidate),
      };
      const response = await nativeFetch(input, requestWithJson(init, nextBody));
      lastResponse = response;
      if (!response.ok) continue;

      let data;
      try { data = await response.clone().json(); } catch { return response; }
      const scene = String(data?.assist?.scene || "").trim();
      const compareAgainst = known.filter(Boolean);
      const valid = sceneIsConcrete(scene) && !tooSimilar(scene, compareAgainst, 0.72);
      if (valid) {
        remember(sceneHistory, SCENE_HISTORY_KEY, key, scene);
        return responseWithJson(response, data);
      }
      failedCandidate = scene;
      if (scene) known.unshift(scene);
    }
    return lastResponse || nativeFetch(input, init);
  }

  function composePromptAvoidance(body, previousValues, failedCandidate = "") {
    const old = [body?.previousQuestion, ...(previousValues || []), failedCandidate]
      .map(x => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!old.length) return "";
    return `${old.join("；")}。换题要求：必须换一个不同的真实生活情境，不要只替换同义词或调整语序。`;
  }

  async function robustPracticePrompt(input, init, body) {
    const key = historyKey(body);
    const known = Array.isArray(promptHistory[key]) ? [...promptHistory[key]] : [];
    if (body.previousQuestion) known.unshift(body.previousQuestion);
    let lastResponse = null;
    let failedCandidate = "";

    for (let attempt = 0; attempt < 3; attempt++) {
      const nextBody = {
        ...body,
        previousQuestion: attempt === 0 && !body.previousQuestion
          ? ""
          : composePromptAvoidance(body, known, failedCandidate),
      };
      const response = await nativeFetch(input, requestWithJson(init, nextBody));
      lastResponse = response;
      if (!response.ok) continue;

      let data;
      try { data = await response.clone().json(); } catch { return response; }
      const question = String(data?.prompt?.question || "").trim();
      if (question && !tooSimilar(question, known, 0.72)) {
        remember(promptHistory, PROMPT_HISTORY_KEY, key, question);
        return responseWithJson(response, data);
      }
      failedCandidate = question;
      if (question) known.unshift(question);
    }
    return lastResponse || nativeFetch(input, init);
  }

  window.fetch = async function lexiFlowFetch(input, init = {}) {
    const endpoint = endpointOf(input);
    const body = parseBody(init);

    if (endpoint === "/api/dictionary/lookup" && body) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        return responseWithJson(response, normalizeChineseLookup(data, body));
      } catch {
        return response;
      }
    }

    if (endpoint === "/api/ai/visual-scene" && body) {
      return robustVisualScene(input, init, body);
    }

    if (endpoint === "/api/ai/practice-prompt" && body) {
      return robustPracticePrompt(input, init, body);
    }

    return nativeFetch(input, init);
  };

  function isGenericFallback(value) {
    const text = String(value || "").trim();
    return /把“?.+”?放进一个你熟悉、具体的生活场景/.test(text);
  }

  function makeLoadingState() {
    const el = document.createElement("div");
    el.className = "scene-generation-state";
    el.innerHTML = `<span class="runtime-spinner" aria-hidden="true"></span><div><strong>AI 正在生成联想场景</strong><span>会自动填入下方，你也可以稍后手动修改。</span></div>`;
    return el;
  }

  function decorateAiStates() {
    document.querySelectorAll(".scene-panel.is-loading").forEach(panel => {
      if (panel.querySelector(".scene-generation-state")) return;
      const label = panel.querySelector(".scene-panel-label");
      const state = makeLoadingState();
      if (label) label.insertAdjacentElement("afterend", state);
      else panel.prepend(state);
    });

    document.querySelectorAll(".scene-editor").forEach(editor => {
      if (!isGenericFallback(editor.value)) return;
      const panel = editor.closest(".scene-panel");
      if (!panel || panel.querySelector(".scene-generation-warning")) return;
      panel.classList.add("has-generic-fallback");
      const warning = document.createElement("div");
      warning.className = "scene-generation-warning";
      warning.innerHTML = `<strong>这次没有生成出具体场景</strong><span>点“换一个场景”重试，或直接写下你想看到的具体画面。</span>`;
      editor.insertAdjacentElement("beforebegin", warning);
    });

    document.querySelectorAll(".visual-image-canvas.is-generating").forEach(canvas => {
      const stage = canvas.closest(".visual-learning-stage");
      if (!stage || stage.querySelector(".background-generation-note")) return;
      const commandBar = stage.querySelector(".visual-command-bar");
      const note = document.createElement("div");
      note.className = "background-generation-note";
      note.innerHTML = `<span class="runtime-spinner" aria-hidden="true"></span><div><strong>联想图正在后台生成</strong><span>不用停在这里等待，可以先进入下一步；完成后会自动保存到这张单词卡。</span></div>`;
      if (commandBar) commandBar.insertAdjacentElement("beforebegin", note);
      else stage.append(note);
    });

    document.querySelectorAll(".ai-practice-prompt").forEach(panel => {
      const text = panel.textContent || "";
      panel.classList.toggle("is-generating-topic", /正在想一个更具体的问题|正在换一个/.test(text));
    });
  }

  let scheduled = false;
  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateAiStates();
    });
  }

  const observer = new MutationObserver(scheduleDecorate);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleDecorate();
    }, { once: true });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleDecorate();
  }
})();
