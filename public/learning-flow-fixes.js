(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);
  let sceneRequestPending = 0;
  let scheduled = false;
  let lastAudit = null;

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

  function hasChinese(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateAll();
    });
  }

  window.fetch = async function lexiFlowLearningFetch(input, init = {}) {
    const endpoint = endpointOf(input);
    const body = parseBody(init);

    if (endpoint === "/api/ai/visual-scene") {
      sceneRequestPending += 1;
      scheduleDecorate();
      try {
        return await previousFetch(input, init);
      } finally {
        sceneRequestPending = Math.max(0, sceneRequestPending - 1);
        scheduleDecorate();
      }
    }

    if (endpoint === "/api/ai/text" && body?.sentence) {
      const response = await previousFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        const feedback = data?.feedback;
        const original = String(body.sentence || "").trim();
        if (!feedback || !original || hasChinese(original)) return response;

        lastAudit = {
          sentence: original,
          word: String(body.word || "").trim(),
          title: String(feedback.title || "").trim(),
          level: String(feedback.level || "").trim(),
          approved: feedback.approved !== false,
          suggestion: String(feedback.suggestion || "").trim(),
          tips: Array.isArray(feedback.tips) ? feedback.tips.map(String).filter(Boolean).slice(0, 3) : [],
        };
        window.__LEXIFLOW_LAST_APPLY_AUDIT__ = lastAudit;

        // Product rule: after an English sentence has been audited, the user may continue.
        // AI edits remain optional. The existing app still enforces that the target word is present.
        const next = {
          ...data,
          feedback: {
            ...feedback,
            approved: true,
            level: "good",
            title: "审核完成，可以继续",
            suggestion: "",
            tips: [],
            optionalSuggestion: lastAudit.suggestion,
          },
        };
        return cloneJsonResponse(response, next);
      } catch {
        return response;
      }
    }

    return previousFetch(input, init);
  };

  function ensureScenePendingState() {
    const stage = document.querySelector(".visual-learning-stage");
    if (!stage) return;
    const panel = stage.querySelector(".scene-panel");
    if (!panel) return;

    const editor = panel.querySelector(".scene-editor");
    const text = String(editor?.value || "").trim();
    const nativeLoading = panel.classList.contains("is-loading") || Boolean(panel.querySelector(".scene-loading"));
    const pending = sceneRequestPending > 0 || nativeLoading || !text;

    let state = panel.querySelector(".scene-generation-state");
    if (pending) {
      panel.classList.add("lexi-scene-pending");
      if (!state) {
        state = document.createElement("div");
        state.className = "scene-generation-state lexi-scene-generation-primary";
        const label = panel.querySelector(".scene-panel-label");
        if (label) label.insertAdjacentElement("afterend", state);
        else panel.prepend(state);
      }
      state.classList.add("lexi-scene-generation-primary");
      state.setAttribute("role", "status");
      state.setAttribute("aria-live", "polite");
      state.innerHTML = `<span class="lexi-ai-orbit" aria-hidden="true"><i></i><b></b></span><div><strong>AI 正在生成联想场景</strong><span>正在生成并传输场景内容，完成后会自动显示。</span></div>`;
    } else {
      panel.classList.remove("lexi-scene-pending");
      state?.remove();
    }
  }

  function decorateAuditFeedback() {
    const panel = document.querySelector(".ai-feedback-panel.good");
    const textarea = document.getElementById("apply-text");
    if (!panel || !textarea || !lastAudit) return;
    if (String(textarea.value || "").trim() !== lastAudit.sentence) return;
    if (panel.querySelector(".lexi-audit-detail")) return;

    const hasAdvice = Boolean(lastAudit.suggestion || lastAudit.tips.length || lastAudit.approved === false);
    if (!hasAdvice) return;

    const detail = document.createElement("div");
    detail.className = "lexi-audit-detail";
    const heading = lastAudit.approved === false ? "AI 发现可改进之处" : "AI 建议（可选）";
    detail.innerHTML = `
      <div class="lexi-audit-detail-head"><strong>${heading}</strong><span>不采用也可以进入下一步</span></div>
      ${lastAudit.suggestion ? `<div class="lexi-audit-suggestion"></div>` : ""}
      ${lastAudit.tips.length ? `<div class="lexi-audit-tips">${lastAudit.tips.map(t => `<span></span>`).join("")}</div>` : ""}
      ${lastAudit.suggestion ? `<button type="button" class="text-action lexi-use-suggestion">使用这条建议并重新审核</button>` : ""}`;

    if (lastAudit.suggestion) detail.querySelector(".lexi-audit-suggestion").textContent = lastAudit.suggestion;
    detail.querySelectorAll(".lexi-audit-tips span").forEach((node, index) => { node.textContent = lastAudit.tips[index] || ""; });
    const actions = panel.querySelector(".ai-feedback-actions");
    if (actions) actions.insertAdjacentElement("beforebegin", detail);
    else panel.append(detail);

    detail.querySelector(".lexi-use-suggestion")?.addEventListener("click", () => {
      if (!lastAudit?.suggestion) return;
      textarea.value = lastAudit.suggestion;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    });
  }

  function decorateBrandIcon() {
    const dataUrl = window.LEXIFLOW_ICON_DATA_URL;
    if (!dataUrl) return;

    const logo = document.querySelector(".brand .logo");
    if (logo && logo.dataset.lexiIconApplied !== "1") {
      logo.dataset.lexiIconApplied = "1";
      logo.classList.add("lexi-brand-logo");
      logo.innerHTML = `<img alt="LexiFlow" />`;
      logo.querySelector("img").src = dataUrl;
    }

    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && favicon.href !== dataUrl) favicon.href = dataUrl;
  }

  function decorateAll() {
    ensureScenePendingState();
    decorateAuditFeedback();
    decorateBrandIcon();
  }

  function startObserver() {
    const app = document.getElementById("app");
    if (!app) return;
    new MutationObserver(scheduleDecorate).observe(app, { childList: true, subtree: false });
    scheduleDecorate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
