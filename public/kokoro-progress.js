(() => {
  "use strict";

  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";
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

  function ensureProgressUi(){
    const row = settingsRow();
    if(!row) return null;
    let box = row.querySelector("[data-kokoro-progress]");
    if(box) return box;
    box = document.createElement("div");
    box.dataset.kokoroProgress = "1";
    box.style.cssText = "width:100%;margin-top:12px;padding-top:12px;border-top:1px solid rgba(120,130,125,.14);";
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:7px">
        <span data-kokoro-progress-label style="font-size:13px;color:var(--muted)">语音模型尚未准备</span>
        <span data-kokoro-progress-percent style="font-size:13px;color:var(--muted)"></span>
      </div>
      <progress data-kokoro-progress-bar max="100" value="0" style="width:100%;height:8px"></progress>
      <div data-kokoro-progress-file style="font-size:12px;color:var(--muted);margin-top:6px;word-break:break-all"></div>
      <div data-kokoro-progress-error style="display:none;margin-top:8px;padding:9px 11px;border-radius:10px;background:rgba(180,70,55,.08);color:#9b463b;font-size:12px;line-height:1.55;word-break:break-word"></div>`;
    row.appendChild(box);
    return box;
  }

  function renderStatus(tts){
    const box = ensureProgressUi();
    if(!box || !tts) return;
    const label = box.querySelector("[data-kokoro-progress-label]");
    const percent = box.querySelector("[data-kokoro-progress-percent]");
    const bar = box.querySelector("[data-kokoro-progress-bar]");
    const file = box.querySelector("[data-kokoro-progress-file]");
    const error = box.querySelector("[data-kokoro-progress-error]");
    const progress = Number.isFinite(Number(tts.progress)) ? Math.max(0, Math.min(100, Number(tts.progress))) : 0;

    if(bar) bar.value = progress;
    if(percent) percent.textContent = (tts.status === "downloading" || tts.status === "loading") ? `${Math.round(progress)}%` : "";
    if(file) file.textContent = clean(tts.file) ? `正在处理：${clean(tts.file)}` : "";
    if(error){ error.style.display = "none"; error.textContent = ""; }

    if(tts.status === "ready"){
      if(label) label.textContent = "本地自然语音已准备完成";
      if(bar) bar.value = 100;
      if(percent) percent.textContent = "100%";
    }else if(tts.status === "downloading"){
      if(label) label.textContent = "正在下载自然语音模型";
    }else if(tts.status === "loading"){
      if(label) label.textContent = progress > 0 ? "模型文件已下载，正在加载" : "正在连接模型源并准备下载";
    }else if(tts.status === "error"){
      if(label) label.textContent = "自然语音模型准备失败";
      if(error){
        error.style.display = "block";
        error.textContent = clean(tts.error) || "模型准备失败。请检查网络或稍后重试。";
      }
    }else{
      if(label) label.textContent = "首次使用需要下载本地语音模型";
    }
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
    if(button) button.disabled = true;
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

  document.addEventListener("click", event => {
    const button = event.target?.closest?.('[data-action="prepare-kokoro-tts"]');
    if(!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void prepare(button);
  }, true);

  const observer = new MutationObserver(() => {
    const row = settingsRow();
    if(!row) return;
    if(!row.querySelector("[data-kokoro-progress]")){
      ensureProgressUi();
      fetchStatus().then(tts => {
        renderStatus(tts);
        if(tts.status === "downloading" || tts.status === "loading") startPolling();
      }).catch(() => {});
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
})();
