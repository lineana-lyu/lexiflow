(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);

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

  function cloneJsonResponse(original, data) {
    const headers = new Headers(original.headers || {});
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.delete("Content-Length");
    return new Response(JSON.stringify(data), {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  }

  window.fetch = async function lexiFlowReviewedSentenceFetch(input, init = {}) {
    const response = await previousFetch(input, init);
    if (endpointOf(input) !== "/api/ai/text" || !response.ok) return response;

    const body = parseBody(init);
    if (!body?.sentence) return response;

    try {
      const payload = await response.clone().json();
      const feedback = payload?.feedback;
      const suggestion = String(feedback?.suggestion || "").trim();

      // If AI says the original sentence is already good, the learner has passed review.
      // Keep any rewrite as optional polish instead of blocking the next step until adopted.
      if (feedback && feedback.approved !== false && feedback.level === "good" && suggestion) {
        const tips = Array.isArray(feedback.tips) ? [...feedback.tips] : [];
        if (!tips.some(item => String(item || "").includes(suggestion))) {
          tips.push(`可选润色：${suggestion}`);
        }
        payload.feedback = {
          ...feedback,
          approved: true,
          level: "good",
          title: feedback.title || "表达正确，可以直接继续",
          suggestion: "",
          optionalSuggestion: suggestion,
          tips,
        };
        return cloneJsonResponse(response, payload);
      }
    } catch {}

    return response;
  };
})();
