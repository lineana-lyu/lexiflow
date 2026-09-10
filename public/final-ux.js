(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);
  const ICON_BASE64_URL = "./app-icon.b64";
  let sceneRequestsInFlight = 0;
  let appIconDataUrl = "";
  let decorateScheduled = false;

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

  function containsChinese(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[“”‘’'"`]/g, "")
      .replace(/[.,!?;:，。！？；：()（）\[\]{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function targetUsed(sentence, word) {
    const source = normalizeText(sentence);
    const target = normalizeText(word);
    if (!source || !target) return false;
    if (target.includes(" ")) return source.includes(target);
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}(?:s|es|ed|ing)?\\b`, "i").test(source);
  }

  function makeSuggestionOptional(data, body) {
    const feedback = data?.feedback;
    const sentence = String(body?.sentence || "").trim();
    const word = String(body?.word || "").trim();
    if (!feedback || !sentence || containsChinese(sentence) || !targetUsed(sentence, word)) return data;

    if (feedback.approved === false || (feedback.level && feedback.level !== "good")) return data;

    const suggestion = String(feedback.suggestion || feedback.optionalSuggestion || "").trim();
    const tips = Array.isArray(feedback.tips) ? feedback.tips.filter(Boolean).map(String) : [];
    const optionalLine = suggestion && normalizeText(suggestion) !== normalizeText(sentence)
      ? `可选表达：${suggestion}`
      : "";
    const nextTips = [
      ...tips.filter(item => !/^可选(?:润色|表达)[：:]/.test(item)),
      ...(optionalLine ? [optionalLine] : []),
    ].slice(0, 2);

    return {
      ...data,
      feedback: {
        ...feedback,
        approved: true,
        level: "good",
        title: "审核完成，可以进入下一步",
        suggestion: "",
        optionalSuggestion: suggestion || feedback.optionalSuggestion || "",
        tips: nextTips,
        reviewCompleted: true,
      },
    };
  }

  window.fetch = async function lexiFlowFinalUxFetch(input, init = {}) {
    const endpoint = endpointOf(input);
    const body = parseBody(init);

    if (endpoint === "/api/ai/visual-scene") {
      sceneRequestsInFlight += 1;
      scheduleDecorate();
      try {
        return await previousFetch(input, init);
      } finally {
        sceneRequestsInFlight = Math.max(0, sceneRequestsInFlight - 1);
        scheduleDecorate();
      }
    }

    if (endpoint === "/api/ai/text" && body?.sentence) {
      const response = await previousFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        return cloneJsonResponse(response, makeSuggestionOptional(data, body));
      } catch {
        return response;
      }
    }

    return previousFetch(input, init);
  };

  function getSceneStateElement(panel) {
    return panel.querySelector(".scene-generation-state,.lexi-scene-generation-state");
  }

  function ensureSceneLoadingFeedback() {
    document.querySelectorAll(".visual-learning-stage").forEach(stage => {
      const panel = stage.querySelector(".scene-panel");
      if (!panel) return;
      const explicitLoading = panel.classList.contains("is-loading") || Boolean(panel.querySelector(".scene-loading"));
      const isLoading = sceneRequestsInFlight > 0 || explicitLoading;
      const editor = panel.querySelector(".scene-editor");
      const editorHasText = Boolean(String(editor?.value || "").trim());
      let status = getSceneStateElement(panel);

      if (isLoading && !editorHasText) {
        stage.classList.add("lexi-scene-is-loading");
        if (!status) {
          status = document.createElement("div");
          status.className = "lexi-scene-generation-state";
          const label = panel.querySelector(".scene-panel-label");
          if (label) label.insertAdjacentElement("afterend", status);
          else panel.prepend(status);
        }
        status.classList.add("lexi-scene-generation-state");
        status.innerHTML = `
          <span class="lexi-scene-loader" aria-hidden="true"><i></i><b></b></span>
          <div>
            <strong>AI 正在生成联想场景</strong>
            <span>正在生成并传输场景内容，完成后会自动填入。</span>
          </div>`;

        const canvas = stage.querySelector(".visual-image-canvas:not(.is-generating) .visual-canvas-empty");
        if (canvas) {
          canvas.classList.add("lexi-awaiting-scene");
          const title = canvas.querySelector("strong");
          const sub = canvas.querySelector("span");
          if (title) title.textContent = "AI 正在生成联想场景";
          if (sub) sub.textContent = "";
        }
      } else {
        stage.classList.remove("lexi-scene-is-loading");
        if (status?.classList.contains("lexi-scene-generation-state")) status.remove();
      }
    });
  }

  function decorateAppIcon() {
    if (!appIconDataUrl) return;
    const favicon = document.querySelector('link[rel~="icon"]');
    if (favicon && favicon.href !== appIconDataUrl) favicon.href = appIconDataUrl;

    document.querySelectorAll(".brand .logo").forEach(logo => {
      if (logo.dataset.lexiAppIcon === "1") return;
      logo.dataset.lexiAppIcon = "1";
      logo.classList.add("lexi-brand-app-icon");
      logo.innerHTML = `<img src="${appIconDataUrl}" alt="LexiFlow" />`;
    });
  }

  function imageJobWord(pill) {
    const candidates = Array.from(pill.querySelectorAll("span"))
      .map(node => String(node.textContent || "").trim())
      .filter(Boolean);
    const line = candidates.find(text => text.includes("·")) || "";
    return line.split("·")[0].trim();
  }

  function scrollToImageWorkspace() {
    const target = document.querySelector(".visual-image-canvas,.library-editor-image-panel");
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("lexi-focus-image-workspace");
    void target.offsetWidth;
    target.classList.add("lexi-focus-image-workspace");
    setTimeout(() => target.classList.remove("lexi-focus-image-workspace"), 1200);
    return true;
  }

  function openImageWorkspaceFromPill(pill) {
    if (scrollToImageWorkspace()) return;
    const word = imageJobWord(pill).toLowerCase();
    const libraryNav = document.querySelector('[data-route="library"]');
    if (!libraryNav) return;
    libraryNav.click();

    setTimeout(() => {
      const rows = Array.from(document.querySelectorAll(".library-row"));
      const row = rows.find(item => String(item.querySelector("td strong")?.textContent || "").trim().toLowerCase() === word) || rows[0];
      const edit = row?.querySelector('[data-action="open-library-editor"]');
      if (edit) edit.click();
      setTimeout(scrollToImageWorkspace, 100);
    }, 100);
  }

  function decorateImageJobPill() {
    const pill = document.querySelector(".runtime-image-job-pill");
    if (!pill || pill.dataset.lexiClickable === "1") return;
    pill.dataset.lexiClickable = "1";
    pill.classList.add("lexi-clickable-image-job");
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    pill.setAttribute("aria-label", "查看正在生成的联想图");
    pill.addEventListener("click", () => openImageWorkspaceFromPill(pill));
    pill.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openImageWorkspaceFromPill(pill);
      }
    });
  }

  function decorateAll() {
    ensureSceneLoadingFeedback();
    decorateAppIcon();
    decorateImageJobPill();
  }

  function scheduleDecorate() {
    if (decorateScheduled) return;
    decorateScheduled = true;
    requestAnimationFrame(() => {
      decorateScheduled = false;
      decorateAll();
    });
  }

  async function loadAppIcon() {
    try {
      const response = await previousFetch(ICON_BASE64_URL, { cache: "force-cache" });
      if (!response.ok) return;
      const base64 = (await response.text()).trim();
      if (!base64) return;
      appIconDataUrl = `data:image/png;base64,${base64}`;
      scheduleDecorate();
    } catch {}
  }

  function start() {
    const app = document.getElementById("app");
    if (app) new MutationObserver(scheduleDecorate).observe(app, { childList: true, subtree: false });
    new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: false });
    scheduleDecorate();
    void loadAppIcon();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();