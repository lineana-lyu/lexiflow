(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const hydratedResults = new WeakSet();
  const inFlight = new Map();
  const pronunciationInFlight = new Map();
  const activeHydrations = new Map();
  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";

  function clean(value) { return String(value || "").trim(); }
  function normalizeWord(value) { return clean(value).toLowerCase(); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
    }[char]));
  }
  function sanitizeExample(value) {
    return clean(value)
      .replace(/\s*\[\s*[=≈~]\s*[^\]]+\]\s*$/u, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    } catch { return ""; }
  }

  function isLocalDictionaryPayload(payload) {
    const result = payload?.result;
    return Boolean(payload?.ok && result && (result.localLookup === true || result.dictionarySource === "ECDICT" || result.dictionarySource === "LexiFlow Core") && Array.isArray(result.senses));
  }

  function resultKey(result, senses) {
    return [normalizeWord(result?.word), ...senses.map(sense => `${clean(sense?.id)}:${clean(sense?.meaningZh)}:${sanitizeExample(sense?.exampleEn)}`)].join("|");
  }

  function currentLookupWord() {
    const heading = document.querySelector(".learning-card-wordtop .word-line h2, .word-result .word-line h2");
    return normalizeWord(heading?.textContent);
  }

  function currentLookupMatches(word) {
    const current = currentLookupWord();
    return !current || current === normalizeWord(word);
  }

  function patchPronunciation(result, pronunciation) {
    if (!result || !pronunciation) return;
    const phonetic = clean(pronunciation.phonetic);
    const audioUrl = clean(pronunciation.audioUrl);
    const audioUrls = Array.isArray(pronunciation.audioUrls) ? pronunciation.audioUrls.map(clean).filter(Boolean) : [];
    if (phonetic) result.phonetic = phonetic;
    if (audioUrl) result.audioUrl = audioUrl;
    if (audioUrls.length) result.audioUrls = audioUrls;
    if (pronunciation.pronunciationSource) result.pronunciationSource = clean(pronunciation.pronunciationSource);
    if (!currentLookupMatches(result.word)) return;
    const phoneticNode = document.querySelector(".learning-card-wordtop .phonetic");
    if (phoneticNode && phonetic) phoneticNode.textContent = phonetic.startsWith("/") || phonetic.startsWith("[") ? phonetic : `/${phonetic}/`;
    const speaker = document.querySelector(".learning-card-wordtop .speaker[data-action=\"speak\"]");
    if (speaker) {
      speaker.dataset.audio = audioUrl;
      speaker.dataset.audios = JSON.stringify(audioUrls);
    }
  }

  async function hydratePronunciation(result) {
    if (!result?.word) return;
    const existing = [clean(result.audioUrl), ...(Array.isArray(result.audioUrls) ? result.audioUrls.map(clean) : [])].filter(Boolean);
    if (existing.length) return;
    const word = normalizeWord(result.word);
    let task = pronunciationInFlight.get(word);
    if (!task) {
      task = nativeFetch(`${API_ORIGIN}/api/dictionary/pronunciation`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({word:result.word}),
      }).then(async response => {
        let payload={}; try{payload=await response.json();}catch{}
        if(!response.ok || !payload?.ok) return null;
        return payload.result || null;
      }).finally(()=>pronunciationInFlight.delete(word));
      pronunciationInFlight.set(word, task);
    }
    try { const pronunciation = await task; if (pronunciation) patchPronunciation(result, pronunciation); } catch {}
  }

  function markLoading(result, senses) {
    if (!currentLookupMatches(result?.word)) return;
    const firstId = clean(result?.senses?.[0]?.id);
    const missingIds = new Set(senses.map(sense => clean(sense.id)));
    if (firstId && missingIds.has(firstId)) {
      const firstSense = result?.senses?.find(s => clean(s.id) === firstId);
      const en = document.querySelector(".example-pair .example-en");
      const zh = document.querySelector(".example-pair .example-zh");
      if (en && !clean(firstSense?.exampleEn) && /暂无例句|手动编辑/.test(clean(en.textContent))) en.textContent = "例句正在后台准备…";
      if (zh && !clean(firstSense?.exampleZh)) zh.textContent = clean(firstSense?.exampleEn) ? "中文翻译正在后台准备…" : "";
    }
  }

  async function playChatTts(text) {
    const value = clean(text);
    if (!value) return false;
    try {
      const response = await nativeFetch(`${API_ORIGIN}/api/tts/chattts`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text:value}),
      });
      const payload = await response.json().catch(()=>({}));
      if (!response.ok || !payload?.ok || !payload?.audioDataUrl) return false;
      const audio = new Audio(payload.audioDataUrl);
      await audio.play();
      return true;
    } catch { return false; }
  }

  async function speakSentence(text) {
    const value = clean(text);
    if (!value) return;
    if (!(await playChatTts(value))) console.warn("LexiFlow custom ChatTTS voice is unavailable");
  }

  function sentenceMarkup(text, className) {
    const value = sanitizeExample(text);
    return `<div class="sentence-audio-line ${className}" data-example-hydrated="1"><span class="sentence-audio-text">${escapeHtml(value)}</span><button class="sentence-speaker" type="button" data-hydrated-sentence="${escapeHtml(value)}" title="播放例句" aria-label="播放例句">🔊</button></div>`;
  }

  function bindHydratedSpeakers(root=document) {
    root.querySelectorAll("[data-hydrated-sentence]").forEach(button => {
      if (button.dataset.hydrationBound === "1") return;
      button.dataset.hydrationBound = "1";
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        void speakSentence(button.dataset.hydratedSentence || "");
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
      if (en && clean(firstItem.exampleEn)) en.outerHTML = sentenceMarkup(firstItem.exampleEn, "example-en");
      const zh = document.querySelector(".example-pair .example-zh");
      if (zh && clean(firstItem.exampleZh)) zh.textContent = clean(firstItem.exampleZh);
    }
    for (const sense of result?.senses || []) {
      const item = byId.get(clean(sense.id));
      if (!item) continue;
      const node = document.querySelector(`[data-sense-id="${CSS.escape(clean(sense.id))}"]`);
      if (!node) continue;
      const en = node.querySelector(".sense-example");
      if (en && clean(item.exampleEn)) en.outerHTML = sentenceMarkup(item.exampleEn, "sense-example");
      const zh = node.querySelector(".sense-example-zh");
      if (zh && clean(item.exampleZh)) zh.textContent = clean(item.exampleZh);
    }
    bindHydratedSpeakers(document);
  }

  function requestExamples(result, missing) {
    const key = resultKey(result, missing);
    let task = inFlight.get(key);
    if (task) return task;
    task = nativeFetch(`${API_ORIGIN}/api/dictionary/examples`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        word:result.word,
        senses:missing.map(sense=>({
          id:sense.id, pos:sense.pos, meaningZh:sense.meaningZh,
          senseIntentEn:sense.senseIntentEn || "", exampleEn:sanitizeExample(sense.exampleEn), exampleZh:sense.exampleZh || "",
        })),
      }),
    }).then(async response => {
      let payload={}; try{payload=await response.json();}catch{}
      if(!response.ok || !payload?.ok) throw new Error(payload?.error || "example hydration failed");
      return Array.isArray(payload.senses) ? payload.senses : [];
    }).finally(()=>inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  }

  async function hydrateResult(result) {
    if (!result || hydratedResults.has(result)) return;
    hydratedResults.add(result);

    for (const sense of Array.isArray(result.senses) ? result.senses : []) {
      if (sense?.exampleEn) sense.exampleEn = sanitizeExample(sense.exampleEn);
    }

    const missing = (Array.isArray(result.senses) ? result.senses : []).filter(sense => !clean(sense.exampleEn) || !clean(sense.exampleZh));
    if (!missing.length) return;
    const wordKey = normalizeWord(result.word);
    const work = (async()=>{
      try {
        const hydrated = await requestExamples(result, missing);
        const byId = new Map(hydrated.map(item => [clean(item.id), item]));
        for (const sense of result.senses || []) {
          const item = byId.get(clean(sense.id));
          if (!item) continue;
          // Existing dictionary English takes precedence. Enrichment may only fill
          // it when the dictionary did not provide one in the first place.
          if (!clean(sense.exampleEn) && clean(item.exampleEn)) sense.exampleEn = sanitizeExample(item.exampleEn);
          if (!clean(sense.exampleZh) && clean(item.exampleZh)) sense.exampleZh = clean(item.exampleZh);
          sense.exampleSource = clean(item.source) || "enriched";
        }
        result.examplesPending = (result.senses || []).some(sense => !clean(sense.exampleEn) || !clean(sense.exampleZh));
        patchDom(result, hydrated.map(item => ({...item, exampleEn:sanitizeExample(item.exampleEn)})));
        window.dispatchEvent(new CustomEvent("lexiflow:examples-hydrated", { detail:{ word:result.word, senses:result.senses } }));
      } catch(err) {
        console.warn("LexiFlow example hydration skipped:", err?.message || err);
        if(currentLookupMatches(result?.word)) {
          const first=result?.senses?.[0];
          const en=document.querySelector(".example-pair .example-en");
          const zh=document.querySelector(".example-pair .example-zh");
          if(en && !clean(first?.exampleEn) && /后台准备|准备中/.test(clean(en.textContent))) en.textContent="暂无例句，可稍后重试";
          if(zh && !clean(first?.exampleZh) && /后台准备|随例句/.test(clean(zh.textContent))) zh.textContent="";
        }
      }
    })();
    activeHydrations.set(wordKey, work);
    setTimeout(()=>{ if(activeHydrations.get(wordKey)===work) markLoading(result, missing); }, 60);
    try { await work; } finally { if(activeHydrations.get(wordKey)===work) activeHydrations.delete(wordKey); }
  }

  window.fetch = async function lexiFlowExampleAwareFetch(input, init) {
    const response = await nativeFetch(input, init);
    const pathname = requestPath(input);
    if (!new Set(["/api/search/smart","/api/dictionary/lookup"]).has(pathname)) return response;
    return new Proxy(response, {
      get(target, prop) {
        if(prop === "json") return async()=>{
          const payload=await target.json();
          if(isLocalDictionaryPayload(payload)) { void hydrateResult(payload.result); void hydratePronunciation(payload.result); }
          return payload;
        };
        const value=Reflect.get(target,prop,target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
})();
