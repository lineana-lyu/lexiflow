(() => {
  "use strict";

  let scheduled = false;
  const APP_ICON_URL = "./icon.png?v=20260911-icon2";

  function applyAppIcon() {
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
      favicon.type = "image/png";
      favicon.href = APP_ICON_URL;
    }

    document.querySelectorAll(".brand .logo").forEach(logo => {
      logo.classList.add("lexi-brand-icon");
      const current = logo.querySelector("img");
      if (current && current.getAttribute("src") === APP_ICON_URL) return;

      logo.textContent = "";
      const image = document.createElement("img");
      image.src = APP_ICON_URL;
      image.alt = "LexiFlow";
      image.decoding = "async";
      image.draggable = false;
      image.addEventListener("load", () => logo.classList.add("is-icon-ready"), { once: true });
      image.addEventListener("error", () => {
        logo.classList.remove("is-icon-ready");
        logo.textContent = "L";
      }, { once: true });
      logo.appendChild(image);
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
    new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
