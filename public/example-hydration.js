(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const hydratedResults = new WeakSet();
  const inFlight = new Map();
  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";

  function clean(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    } catch {
      return "";
    }
  }

  function isLocalDictionaryPayload(payload) {
    const result = payload?.result;
    return Boolean(
      payload?.ok &&
      result &&
      (result.localLookup === true || result.dictionarySource === "ECDICT") &&
      Array.isArray(result.senses)
    );
  }

  function resultKey(result, senses) {
    return [
      clean(result?.word).toLowerCase(),
      ...senses.map(sense => `${clean(sense?.id)}:${clean(sense?.meaningZh)}`),
    ].join("|");
  }

  function currentLookupMatches(word) {
    const heading = document.querySelector(".learning-card-wordtop .word-line h2, .word-result .word-line h2");
    return !heading || clean(heading.textContent).toLowerCase() === clean(word).toLowerCase();
  }

  function markLoading(result, senses) {
    if (!currentLookupMatches(result?.word)) return;
    const firstId = clean(result?.senses?.[0]?.id);
    const missingIds = new Set(senses.map(sense => clean(sense.id)));

    if (firstId && missingIds.has(firstId)) {
      const en = document.querySelector(".example-pair .example-en");
      const zh = document.querySelector(".example-pair .example-zh");
      if (en && /暂无例句|手动编辑/.test(clean(en.textContent))) en.textContent = "例句正在准备中…";
      if (zh && /暂无翻译|手动编辑/.test(clean(zh.textContent))) zh.textContent = "中文翻译会随例句一起出现。";
    }

    for (const sense of senses) {
      const id = clean(sense.id);
      if (!id || id === firstId) continue;
      const node = document.querySelector(`[data-sense-id="${CSS.escape(id)}"]`);
      const en = node?.querySelector(".sense-example");
      if (en && /暂无例句/.test(clean(en.textContent))) en.textContent = "例句正在准备中…";
    }
  }

  function speakSentence(text) {
    if (!("speechSynthesis" in window)) return;
    const value = clean(text);
    if (!value) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function sentenceMarkup(text, className) {
    const value = clean(text);
    return `<div class="sentence-audio-line ${className}" data-example-hydrated="1">
      <span class="sentence-audio-text">${escapeHtml(value)}</span>
      <button class="sentence-speaker" type="button" data-hydrated-sentence="${escapeHtml(value)}" title="播放例句" aria-label="播放例句">🔊</button>
    </div>`;
  }

  function bindHydratedSpeakers(root = document) {
    root.querySelectorAll("[data-hydrated-sentence]").forEach(button => {
      if (button.dataset.hydrationBound === "1") return;
      button.dataset.hydrationBound = "1";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        speakSentence(button.dataset.hydratedSentence || "");
      });
    });
  }

  function patchDom(result, hydrated) {
    if (!currentLookupMatches(result?.word)) return;
    const byId = new Map(hydrated.map(item => [clean(item.id), item]));
    const first = result?.senses?.[0];
    const firstItem = first ? byId.get(clean(first.id)) : null;

    if (firstItem) {
      const en = document.querySelector(".example-pair .example-en");
      if (en) en.outerHTML = sentenceMarkup(firstItem.exampleEn, "example-en");
      const zh = document.querySelector(".example-pair .example-zh");
      if (zh) zh.textContent = clean(firstItem.exampleZh);
    }

    for (const sense of result?.senses || []) {
      const item = byId.get(clean(sense.id));
      if (!item) continue;
      const node = document.querySelector(`[data-sense-id="${CSS.escape(clean(sense.id))}"]`);
      if (!node) continue;
      const en = node.querySelector(".sense-example");
      if (en) en.outerHTML = sentenceMarkup(item.exampleEn, "sense-example");
      const zh = node.querySelector(".sense-example-zh");
      if (zh) zh.textContent = clean(item.exampleZh);
    }

    bindHydratedSpeakers(document);
  }

  async function hydrateResult(result) {
    if (!result || hydratedResults.has(result)) return;
    hydratedResults.add(result);

    const missing = (Array.isArray(result.senses) ? result.senses : []).filter(sense => !clean(sense.exampleEn) || !clean(sense.exampleZh));
    if (!missing.length) return;

    const key = resultKey(result, missing);
    setTimeout(() => markLoading(result, missing), 30);

    let task = inFlight.get(key);
    if (!task) {
      task = nativeFetch(`${API_ORIGIN}/api/dictionary/examples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: result.word,
          senses: missing.map(sense => ({
            id: sense.id,
            pos: sense.pos,
            meaningZh: sense.meaningZh,
            senseIntentEn: sense.senseIntentEn || "",
          })),
        }),
      }).then(async response => {
        let payload = {};
        try { payload = await response.json(); } catch {}
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "example hydration failed");
        return Array.isArray(payload.senses) ? payload.senses : [];
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, task);
    }

    try {
      const hydrated = await task;
      const byId = new Map(hydrated.map(item => [clean(item.id), item]));
      for (const sense of result.senses || []) {
        const item = byId.get(clean(sense.id));
        if (!item) continue;
        sense.exampleEn = clean(item.exampleEn) || sense.exampleEn;
        sense.exampleZh = clean(item.exampleZh) || sense.exampleZh;
        sense.exampleSource = clean(item.source) || "enriched";
      }
      result.examplesPending = (result.senses || []).some(sense => !clean(sense.exampleEn) || !clean(sense.exampleZh));
      patchDom(result, hydrated);
    } catch (err) {
      console.warn("LexiFlow example hydration skipped:", err?.message || err);
      if (currentLookupMatches(result?.word)) {
        const en = document.querySelector(".example-pair .example-en");
        const zh = document.querySelector(".example-pair .example-zh");
        if (en && /准备中/.test(clean(en.textContent))) en.textContent = "暂无例句，可稍后重试或手动编辑";
        if (zh && /随例句/.test(clean(zh.textContent))) zh.textContent = "";
      }
    }
  }

  window.fetch = async function lexiFlowExampleAwareFetch(input, init) {
    const response = await nativeFetch(input, init);
    const pathname = requestPath(input);
    if (!new Set(["/api/search/smart", "/api/dictionary/lookup"]).has(pathname)) return response;

    return new Proxy(response, {
      get(target, prop) {
        if (prop === "json") {
          return async () => {
            const payload = await target.json();
            if (isLocalDictionaryPayload(payload)) void hydrateResult(payload.result);
            return payload;
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
})();
