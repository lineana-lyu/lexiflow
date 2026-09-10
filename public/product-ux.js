(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);
  const DICTIONARY_KEY_URL = "https://www.dictionaryapi.com/register/index";
  const CUSTOM_GOAL_KEY = "lexiflow-daily-goal-custom-v1";
  let scheduled = false;

  function endpointOf(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url || "";
      return new URL(raw, location.href).pathname;
    } catch {
      return "";
    }
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

  // New installs start with a 3-word daily goal. Existing users keep their saved goal.
  window.fetch = async function lexiFlowProductFetch(input, init = {}) {
    const response = await previousFetch(input, init);
    const endpoint = endpointOf(input);
    const method = String(init?.method || "GET").toUpperCase();
    if (endpoint !== "/api/learning-data" || method !== "GET" || !response.ok) return response;

    try {
      const payload = await response.clone().json();
      if (!payload?.hasStoredData && payload?.data) {
        const settings = { ...(payload.data.settings || {}) };
        if (!Number.isFinite(Number(settings.dailyGoal)) || Number(settings.dailyGoal) === 5) settings.dailyGoal = 3;
        payload.data = { ...payload.data, settings };
        return cloneJsonResponse(response, payload);
      }
    } catch {}
    return response;
  };

  function speakerSvg() {
    return `<svg class="lexi-speaker-svg" viewBox="0 0 28 28" aria-hidden="true">
      <circle class="lexi-speaker-aura" cx="8.3" cy="8.2" r="6.1" fill="#E5F5F1"/>
      <path class="lexi-speaker-body" d="M4.9 11.3h3.2l4.35-3.55v12.5L8.1 16.7H4.9a1.45 1.45 0 0 1-1.45-1.45v-2.5A1.45 1.45 0 0 1 4.9 11.3Z"/>
      <path class="lexi-speaker-wave wave-one" d="M16.1 11.05c1.65 1.62 1.65 4.28 0 5.9"/>
      <path class="lexi-speaker-wave wave-two" d="M19.2 8.35c3.18 3.13 3.18 8.22 0 11.35"/>
    </svg>`;
  }

  function decorateSpeakers() {
    document.querySelectorAll(".speaker,.sentence-speaker").forEach(button => {
      if (button.dataset.lexiSpeakerDecorated === "1") return;
      button.dataset.lexiSpeakerDecorated = "1";
      button.classList.add("lexi-speaker-button");
      button.innerHTML = speakerSvg();
      button.addEventListener("click", () => {
        button.classList.remove("lexi-speaker-playing");
        void button.offsetWidth;
        button.classList.add("lexi-speaker-playing");
        window.setTimeout(() => button.classList.remove("lexi-speaker-playing"), 1500);
      });
    });
  }

  function rowByTitle(list, title) {
    return Array.from(list.querySelectorAll(":scope > .setting-row")).find(row => row.querySelector("h3")?.textContent.trim() === title) || null;
  }

  function decorateDictionarySettings(list) {
    const row = rowByTitle(list, "英语词典");
    if (!row) return;

    const intro = row.querySelector("p");
    if (intro && !intro.dataset.lexiFriendlyCopy) {
      intro.dataset.lexiFriendlyCopy = "1";
      const connected = /已连接/.test(intro.textContent || "");
      intro.textContent = connected ? "词典已连接，可用于释义、音标和单词发音。" : "连接词典后，可获得更稳定的释义、音标和单词发音。";
      const link = document.createElement("a");
      link.className = "settings-inline-link";
      link.href = DICTIONARY_KEY_URL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "获取免费词典密钥 ↗";
      intro.insertAdjacentElement("afterend", link);
    }

    const keyInput = row.querySelector("#mw-api-key");
    if (keyInput) {
      keyInput.placeholder = "粘贴词典密钥";
      keyInput.setAttribute("aria-label", "词典密钥");
    }
  }

  function decorateSecurityBanner() {
    const banner = document.querySelector(".settings-security-banner");
    if (!banner || banner.dataset.lexiFriendly === "1") return;
    banner.dataset.lexiFriendly = "1";
    banner.innerHTML = `<span class="settings-security-icon">⌁</span><div><strong>连接信息只保存在当前设备</strong><span>用于词典和 AI 服务，不会显示在学习内容中。</span></div>`;
  }

  function mergeAiSettings(list) {
    if (list.querySelector(".ai-unified-setting")) return;
    const serviceRow = rowByTitle(list, "AI 服务");
    const modelRow = rowByTitle(list, "模型与思考强度");
    const imageRow = rowByTitle(list, "图片生成");
    if (!serviceRow || !modelRow || !imageRow) return;

    const serviceActions = serviceRow.querySelector(".setting-actions-inline");
    const diagnostics = serviceRow.querySelector(".advanced-diagnostics");
    const controls = modelRow.querySelector(".codex-runtime-grid");
    const imageStatus = imageRow.querySelector(".pill");

    const merged = document.createElement("div");
    merged.className = "setting-row ai-unified-setting";
    merged.innerHTML = `
      <div class="ai-unified-head">
        <div>
          <span class="settings-section-kicker">智能能力</span>
          <h3>AI 助手</h3>
          <p>用于联想场景、造句反馈和联想图生成。</p>
        </div>
        <div class="ai-unified-status"></div>
      </div>
      <div class="ai-unified-controls"></div>
      <div class="ai-unified-image-row">
        <div><strong>联想图生成</strong><span>与文字能力使用同一套 AI 配置。</span></div>
        <div class="ai-unified-image-status"></div>
      </div>
      <div class="ai-unified-diagnostics"></div>`;

    serviceRow.insertAdjacentElement("beforebegin", merged);
    if (serviceActions) merged.querySelector(".ai-unified-status")?.appendChild(serviceActions);
    if (controls) merged.querySelector(".ai-unified-controls")?.appendChild(controls);
    if (imageStatus) merged.querySelector(".ai-unified-image-status")?.appendChild(imageStatus);
    if (diagnostics) merged.querySelector(".ai-unified-diagnostics")?.appendChild(diagnostics);
    serviceRow.remove();
    modelRow.remove();
    imageRow.remove();
  }

  function decorateDailyGoal(list) {
    const row = rowByTitle(list, "每日学习目标");
    if (!row || row.querySelector(".daily-goal-number")) return;
    const select = row.querySelector("#daily-goal");
    if (!select) return;

    select.classList.add("daily-goal-native-select");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;

    const stored = Number(localStorage.getItem(CUSTOM_GOAL_KEY));
    let initial = Number.isFinite(stored) && stored >= 1 ? stored : Number(select.value || 3);
    if (!Number.isFinite(initial) || initial < 1) initial = 3;

    const editor = document.createElement("div");
    editor.className = "daily-goal-editor";
    editor.innerHTML = `<button type="button" class="goal-step" data-step="-1" aria-label="减少每日目标">−</button><label><input class="daily-goal-number" type="number" min="1" max="100" step="1" value="${Math.round(initial)}" aria-label="每日学习目标"><span>个词 / 天</span></label><button type="button" class="goal-step" data-step="1" aria-label="增加每日目标">＋</button>`;
    select.insertAdjacentElement("beforebegin", editor);

    const input = editor.querySelector(".daily-goal-number");
    const commit = () => {
      let value = Math.round(Number(input.value || 3));
      value = Math.max(1, Math.min(100, Number.isFinite(value) ? value : 3));
      input.value = String(value);
      try { localStorage.setItem(CUSTOM_GOAL_KEY, String(value)); } catch {}
      let option = Array.from(select.options).find(item => Number(item.value) === value);
      if (!option) {
        option = new Option(`${value} 个词`, String(value));
        select.appendChild(option);
      }
      select.value = String(value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };

    input.addEventListener("change", commit);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); input.blur(); commit(); }
    });
    editor.querySelectorAll(".goal-step").forEach(button => button.addEventListener("click", () => {
      input.value = String(Math.max(1, Math.min(100, Number(input.value || 3) + Number(button.dataset.step || 0))));
      commit();
    }));

    // Read the authoritative persisted value so custom values survive page rerenders.
    previousFetch("/api/learning-data", { method: "GET", cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        const current = Number(payload?.data?.settings?.dailyGoal);
        if (!Number.isFinite(current) || current < 1 || !document.body.contains(input)) return;
        input.value = String(Math.round(current));
        try { localStorage.setItem(CUSTOM_GOAL_KEY, String(Math.round(current))); } catch {}
      })
      .catch(() => {});
  }

  function decorateSettings() {
    const list = document.querySelector(".settings-list");
    if (!list) return;
    decorateSecurityBanner();
    decorateDictionarySettings(list);
    mergeAiSettings(list);
    decorateDailyGoal(list);
  }

  function decorateInitialSceneLoading() {
    document.querySelectorAll(".scene-generation-state").forEach(state => {
      if (state.dataset.lexiSceneEmphasis === "1") return;
      state.dataset.lexiSceneEmphasis = "1";
      const strong = state.querySelector("strong");
      const sub = state.querySelector("span:not(.runtime-spinner)");
      if (strong) strong.textContent = "AI 正在构思联想场景";
      if (sub) sub.textContent = "正在结合当前词义和例句生成一个具体画面。";
    });
  }

  function extractJobWord(pill) {
    const detail = pill.querySelector("div span")?.textContent || "";
    return detail.split("·")[0].trim();
  }

  function focusImageArea() {
    const target = document.querySelector(".visual-image-canvas,.library-editor-image-panel");
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("lexi-image-focus-pulse");
    void target.offsetWidth;
    target.classList.add("lexi-image-focus-pulse");
    window.setTimeout(() => target.classList.remove("lexi-image-focus-pulse"), 950);
    return true;
  }

  function openImageWorkspaceFromJob(pill) {
    if (focusImageArea()) return;
    const word = extractJobWord(pill).toLowerCase();
    const libraryNav = document.querySelector('[data-route="library"]');
    if (!libraryNav) return;
    libraryNav.click();

    requestAnimationFrame(() => {
      const rows = Array.from(document.querySelectorAll("[data-library-card]"));
      const row = rows.find(item => item.querySelector("td strong")?.textContent.trim().toLowerCase() === word) || rows.find(item => item.textContent.toLowerCase().includes(word));
      const edit = row?.querySelector('[data-action="open-library-editor"]');
      if (!edit) return;
      edit.click();
      requestAnimationFrame(() => focusImageArea());
    });
  }

  function decorate() {
    decorateSpeakers();
    decorateSettings();
    decorateInitialSceneLoading();
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
    });
  }

  function startObserver() {
    const app = document.getElementById("app");
    if (!app) return;
    new MutationObserver(scheduleDecorate).observe(app, { childList: true, subtree: false });
    scheduleDecorate();
  }

  document.addEventListener("click", event => {
    const pill = event.target?.closest?.(".runtime-image-job-pill");
    if (!pill) return;
    openImageWorkspaceFromJob(pill);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
