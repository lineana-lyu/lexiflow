(() => {
  "use strict";

  let scheduled = false;

  function iconDataUrl() {
    const value = String(window.LEXIFLOW_APP_ICON_BASE64 || "").trim();
    return value ? `data:image/png;base64,${value}` : "";
  }

  function applyAppIcon() {
    const src = iconDataUrl();
    if (!src) return;

    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && favicon.dataset.lexiIconApplied !== "1") {
      favicon.dataset.lexiIconApplied = "1";
      favicon.type = "image/png";
      favicon.href = src;
    }

    document.querySelectorAll(".brand .logo").forEach(logo => {
      if (logo.dataset.lexiIconApplied === "1") return;
      logo.dataset.lexiIconApplied = "1";
      logo.classList.add("lexi-brand-icon");
      logo.innerHTML = `<img src="${src}" alt="LexiFlow" />`;
    });
  }

  function sceneIsEmpty(panel) {
    const editor = panel.querySelector(".scene-editor");
    const cue = panel.querySelector(".scene-cue");
    const text = String(editor?.value || editor?.textContent || "").trim();
    return !text && !cue;
  }

  function makeImmediateSceneState() {
    const state = document.createElement("div");
    state.className = "scene-generation-state lexi-scene-immediate-state";
    state.setAttribute("role", "status");
    state.setAttribute("aria-live", "polite");
    state.innerHTML = `
      <span class="runtime-spinner" aria-hidden="true"></span>
      <div>
        <strong>AI 正在生成联想场景</strong>
        <span>正在生成并传回一个具体画面，完成后会自动填入这里。</span>
      </div>`;
    return state;
  }

  function decorateSceneGeneration() {
    document.querySelectorAll(".scene-panel").forEach(panel => {
      const existing = panel.querySelector(".scene-generation-state");
      const loading = panel.classList.contains("is-loading") || Boolean(panel.querySelector(".scene-loading"));
      const empty = sceneIsEmpty(panel);

      if ((loading || empty) && !existing && !panel.querySelector(".scene-generation-warning")) {
        const label = panel.querySelector(".scene-panel-label");
        const state = makeImmediateSceneState();
        if (label) label.insertAdjacentElement("afterend", state);
        else panel.prepend(state);
      }

      const state = panel.querySelector(".lexi-scene-immediate-state");
      if (state && !loading && !sceneIsEmpty(panel)) state.remove();
    });

    document.querySelectorAll(".scene-generation-state").forEach(state => {
      const strong = state.querySelector("strong");
      const sub = state.querySelector("span:not(.runtime-spinner)");
      if (strong) strong.textContent = "AI 正在生成联想场景";
      if (sub) sub.textContent = "正在生成并传回一个具体画面，完成后会自动填入这里。";
    });
  }

  function decorate() {
    applyAppIcon();
    decorateSceneGeneration();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
    });
  }

  function start() {
    const app = document.getElementById("app");
    if (!app) return;
    new MutationObserver(schedule).observe(app, { childList: true, subtree: false });
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
