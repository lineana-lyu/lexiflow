(() => {
  "use strict";

  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";
  const PREVIEW_TEXT = "I enjoy learning English with LexiFlow.";
  let preparing = false;
  let pollTimer = null;
  let lastStatus = null;

  function clean(value){ return String(value || "").trim(); }

  async function fetchStatus(){
    const response = await fetch(`${API_ORIGIN}/api/tts/kokoro/status`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    lastStatus = payload.tts || {};
    return lastStatus;
  }

  function settingsRow(){
    return Array.from(document.querySelectorAll(".setting-row")).find(row =>
      clean(row.querySelector("h3")?.textContent).includes("本地自然发音")
    ) || null;
  }

  function controlsArea(){
    return settingsRow()?.querySelector(".setting-actions-inline") || null;
  }

  function ensureLayout(){
    const controls = controlsArea();
    if(!controls || controls.dataset.kokoroEnhanced === "1") return controls;
    controls.dataset.kokoroEnhanced = "1";
    controls.style.columnGap = "10px";
    controls.style.rowGap = "10px";

    const field = controls.querySelector(".field");
    const select = controls.querySelector("#tts-voice");
    if(field && select && !controls.querySelector("[data-kokoro-voice-tools]")){
      const tools = document.createElement("div");
      tools.dataset.kokoroVoiceTools = "1";
      tools.style.cssText = "display:flex;align-items:flex-end;gap:8px;flex:1 1 320px;min-width:280px;";
      field.parentNode.insertBefore(tools, field);
      tools.appendChild(field);
      field.style.flex = "1 1 auto";
      field.style.minWidth = "210px";

      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "btn";
      preview.dataset.action = "preview-kokoro-voice";
      preview.textContent = "试听音色";
      preview.title = "播放一条短句试听当前合成音色";
      tools.appendChild(preview);
    }
    return controls;
  }

  function removeProgressUi(){
    settingsRow()?.querySelector("[data-kokoro-progress]")?.remove();
  }

  function ensureProgressUi(){
    const controls = ensureLayout();
    if(!controls) return null;
    let box = controls.querySelector("[data-kokoro-progress]");
    if(box) return box;
    box = document.createElement("div");
    box.dataset.kokoroProgress = "1";
    box.style.cssText = "flex:0 0 100%;margin-top:2px;padding:10px 12px;border-radius:12px;background:rgba(120,140,132,.055);border:1px solid rgba(120,130,125,.12);box-sizing:border-box;";
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:7px">
        <span data-kokoro-progress-label style="font-size:13px;color:var(--muted)">正在准备自然语音模型</span>
        <span data-kokoro-progress-percent style="font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums"></span>
      </div>
      <progress data-kokoro-progress-bar max="100" value="0" style="display:block;width:100%;height:7px"></progress>
      <div data-kokoro-progress-file style="font-size:12px;color:var(--muted);margin-top:6px;word-break:break-all"></div>`;
    controls.appendChild(box);
    return box;
  }

  function removeErrorUi(){
    settingsRow()?.querySelector("[data-kokoro-error]")?.remove();
  }

  function showErrorUi(message){
    const controls = ensureLayout();
    if(!controls) return;
    let box = controls.querySelector("[data-kokoro-error]");
    if(!box){
      box = document.createElement("div");
      box.dataset.kokoroError = "1";
      box.style.cssText = "flex:0 0 100%;padding:9px 11px;border-radius:10px;background:rgba(180,70,55,.08);color:#9b463b;font-size:12px;line-height:1.55;word-break:break-word;box-sizing:border-box;";
      controls.appendChild(box);
    }
    box.textContent = clean(message) || "模型准备失败。请稍后重试。";
  }

  function syncControls(tts){
    const controls = ensureLayout();
    if(!controls || !tts) return;
    const pill = controls.querySelector(".pill");
    const prepareButton = controls.querySelector('[data-action="prepare-kokoro-tts"]');
    const previewButton = controls.querySelector('[data-action="preview-kokoro-voice"]');
    const active = tts.status === "downloading" || tts.status === "loading";

    if(pill){
      pill.classList.remove("green","red","amber");
      if(tts.status === "ready"){
        pill.classList.add("green");
        pill.textContent = "本地模型已就绪";
      }else if(tts.status === "error"){
        pill.classList.add("red");
        pill.textContent = "准备失败";
      }else{
        pill.classList.add("amber");
        pill.textContent = active ? "正在准备模型" : "首次使用自动准备";
      }
    }

    if(prepareButton){
      prepareButton.disabled = active;
      prepareButton.textContent = tts.status === "ready" ? "重新检查" : tts.status === "error" ? "重新准备" : "准备语音模型";
    }
    if(previewButton){
      previewButton.disabled = active;
      previewButton.title = active ? "语音模型正在准备" : "播放一条短句试听当前合成音色";
    }
  }

  function renderStatus(tts){
    if(!tts) return;
    syncControls(tts);
    const active = tts.status === "downloading" || tts.status === "loading";
    const progress = Number.isFinite(Number(tts.progress)) ? Math.max(0, Math.min(100, Number(tts.progress))) : 0;

    if(active){
      removeErrorUi();
      const box = ensureProgressUi();
      if(!box) return;
      const label = box.querySelector("[data-kokoro-progress-label]");
      const percent = box.querySelector("[data-kokoro-progress-percent]");
      const bar = box.querySelector("[data-kokoro-progress-bar]");
      const file = box.querySelector("[data-kokoro-progress-file]");
      if(bar) bar.value = progress;
      if(percent) percent.textContent = `${Math.round(progress)}%`;
      if(file) file.textContent = clean(tts.file) ? `正在处理：${clean(tts.file)}` : "";
      if(label){
        label.textContent = tts.status === "downloading"
          ? "正在下载自然语音模型"
          : progress > 0
            ? "模型文件已下载，正在加载"
            : "正在连接模型源并准备下载";
      }
      return;
    }

    // The progress bar is a transient preparation affordance. Once preparation
    // finishes (success or failure) it disappears so the Settings layout returns
    // to its compact steady state.
    removeProgressUi();
    if(tts.status === "error") showErrorUi(tts.error);
    else removeErrorUi();
  }

  function stopPolling(){
    if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  }

  function startPolling(){
    if(pollTimer) return;
    const tick = async () => {
      try{
        const tts = await fetchStatus();
        renderStatus(tts);
        if(tts.status === "ready" || tts.status === "error"){
          preparing = false;
          stopPolling();
        }
      }catch{}
    };
    void tick();
    pollTimer = setInterval(tick, 450);
  }

  async function prepare(button){
    if(preparing) return;
    preparing = true;
    renderStatus({ status: "loading", progress: 0, file: "" });
    startPolling();
    try{
      const response = await fetch(`${API_ORIGIN}/api/tts/kokoro/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const payload = await response.json().catch(() => ({}));
      const tts = await fetchStatus().catch(() => payload?.tts || null);
      if(tts) renderStatus(tts);
      if(!response.ok || !payload?.ok){
        const detail = clean(tts?.error);
        const message = detail || clean(payload?.userError?.message) || clean(payload?.error) || "自然语音模型准备失败";
        throw new Error(message);
      }
    }catch(err){
      const tts = await fetchStatus().catch(() => ({ status: "error", error: err?.message || String(err) }));
      renderStatus(tts);
    }finally{
      preparing = false;
      if(button && button.isConnected) button.disabled = false;
      const tts = lastStatus;
      if(tts?.status !== "downloading" && tts?.status !== "loading") stopPolling();
    }
  }

  async function previewVoice(button){
    if(button?.disabled) return;
    let tts;
    try{ tts = await fetchStatus(); }catch{ tts = lastStatus || {}; }
    renderStatus(tts);
    if(tts.status === "downloading" || tts.status === "loading") return;

    const player = window.LexiFlowNaturalTts?.play;
    if(typeof player !== "function") return;

    if(tts.status !== "ready") startPolling();
    if(button) button.disabled = true;
    try{
      await player(PREVIEW_TEXT, button || null);
      const next = await fetchStatus().catch(() => null);
      if(next) renderStatus(next);
    }finally{
      if(button && button.isConnected) button.disabled = false;
    }
  }

  document.addEventListener("click", event => {
    const prepareButton = event.target?.closest?.('[data-action="prepare-kokoro-tts"]');
    if(prepareButton){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void prepare(prepareButton);
      return;
    }

    const previewButton = event.target?.closest?.('[data-action="preview-kokoro-voice"]');
    if(previewButton){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void previewVoice(previewButton);
    }
  }, true);

  const observer = new MutationObserver(() => {
    const row = settingsRow();
    if(!row) return;
    const controls = ensureLayout();
    if(!controls || controls.dataset.kokoroStatusBound === "1") return;
    controls.dataset.kokoroStatusBound = "1";
    fetchStatus().then(tts => {
      renderStatus(tts);
      if(tts.status === "downloading" || tts.status === "loading") startPolling();
    }).catch(() => {});
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
})();
