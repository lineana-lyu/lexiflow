(() => {
  "use strict";

  let scheduled = false;

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

  function extractJobWord(pill) {
    const detail = pill.querySelector("div span")?.textContent || "";
    return detail.split("·")[0].trim();
  }

  function focusImageArea() {
    const target = document.querySelector(".lexi-v3-visual-image,.library-editor-image-panel");
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