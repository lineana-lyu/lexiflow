(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);

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

  function hasChinese(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function clean(value) {
    return String(value || "").trim().replace(/[。；;，,]+$/g, "");
  }

  function shouldShortenMeaning(source, meaning) {
    const q = clean(source);
    const current = clean(meaning);
    if (!q || !current || !hasChinese(q) || q.length > 10 || current === q) return false;
    if (!current.includes(q)) return false;
    if (current.length > q.length + 12) return false;
    return (
      current.endsWith(q) ||
      current.startsWith(q) ||
      /(用来|用于|用的|指的是|指|即|一种|一个|专门)/.test(current)
    );
  }

  function normalizeCard(card) {
    if (!card || typeof card !== "object") return { card, changed: false };
    const source = clean(card.sourceQuery || "");
    const meaning = clean(card.meaningZh || "");
    if (!shouldShortenMeaning(source, meaning)) return { card, changed: false };
    return {
      changed: true,
      card: {
        ...card,
        meaningZh: source,
        glossZh: card.glossZh || meaning,
      },
    };
  }

  function normalizeLearningPayload(payload) {
    if (!payload?.data || !Array.isArray(payload.data.cards)) return { payload, changed: false };
    let changed = false;
    const cards = payload.data.cards.map(card => {
      const result = normalizeCard(card);
      changed = changed || result.changed;
      return result.card;
    });
    if (!changed) return { payload, changed: false };
    return {
      changed: true,
      payload: {
        ...payload,
        data: { ...payload.data, cards },
      },
    };
  }

  window.fetch = async function lexiFlowLegacyDataFix(input, init = {}) {
    const endpoint = endpointOf(input);
    if (endpoint !== "/api/learning-data") return nativeFetch(input, init);

    const method = String(init.method || "GET").toUpperCase();

    if (method === "POST") {
      const body = parseBody(init);
      if (body?.data && Array.isArray(body.data.cards)) {
        const normalized = normalizeLearningPayload({ data: body.data });
        if (normalized.changed) {
          return nativeFetch(input, {
            ...init,
            headers: { "Content-Type": "application/json", ...(init.headers || {}) },
            body: JSON.stringify({ ...body, data: normalized.payload.data }),
          });
        }
      }
      return nativeFetch(input, init);
    }

    const response = await nativeFetch(input, init);
    if (!response.ok) return response;

    try {
      const data = await response.clone().json();
      const normalized = normalizeLearningPayload(data);
      if (!normalized.changed) return response;

      // Persist the safe normalization once, so older cards are repaired instead
      // of only looking correct for the current session.
      queueMicrotask(() => {
        nativeFetch("/api/learning-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: normalized.payload.data }),
        }).catch(() => {});
      });

      return responseWithJson(response, normalized.payload);
    } catch {
      return response;
    }
  };
})();
