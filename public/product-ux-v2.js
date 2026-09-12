(() => {
  "use strict";

  let scheduled = false;
  const APP_ICON_URL = "./icon.png?v=20260911-icon3";

  function applyAppIcon() {
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
      favicon.type = "image/png";
      favicon.href = APP_ICON_URL;
    }

    document.querySelectorAll(".brand .logo").forEach(logo => {
      logo.classList.add("lexi-brand-icon");
      logo.textContent = "";
      let image = logo.querySelector("img.lexi-brand-icon-image");
      if (!image) {
        image = document.createElement("img");
        image.className = "lexi-brand-icon-image";
        image.alt = "LexiFlow";
        image.draggable = false;
        logo.appendChild(image);
      }
      image.src = APP_ICON_URL;
    });
  }

  function decorateLearningCopy() {
    document.querySelectorAll('[data-action="save-card"]').forEach(button => {
      if (!button.disabled) button.textContent = "保存到学习计划";
    });
    document.querySelectorAll('[data-action="complete-stage"][data-next="memorize1"]').forEach(button => {
      button.textContent = "确认这个词义，明天开始记忆";
      button.title = "确认后今天不继续背诵，Memorize 会在下一个学习日开放";
    });
  }

  function decorate() {
    applyAppIcon();
    decorateLearningCopy();
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
