(() => {
  "use strict";

  const API_ORIGIN = location.protocol === "file:" ? "http://127.0.0.1:4177" : "";
  let pollTimer = null;
  let prepareRequest = null;
  let lastStatus = null;

  function clean(value){ return String(value ?? "").trim(); }
  function clamp(value){ const n=Number(value); return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0; }

  function findTtsRow(){
    return Array.from(document.querySelectorAll(".setting-row")).find(row =>
      clean(row.querySelector("h3")?.textContent).includes("本地自然发音")
    ) || null;
  }

  function ensurePanel(){
    const row=findTtsRow();
    if(!row)return null;
    let panel=row.querySelector("[data-kokoro-progress-panel]");
    if(panel)return panel;
    panel=document.createElement("div");
    panel.dataset.kokoroProgressPanel="1";
    panel.style.cssText="width:100%;margin-top:14px;padding-top:12px;border-top:1px solid rgba(32,48,43,.08);grid-column:1/-1";
    panel.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:7px;font-size:12px;color:var(--muted)">
        <span data-kokoro-progress-label>首次使用时会下载本地语音模型</span>
        <span data-kokoro-progress-percent></span>
      </div>
      <div style="height:8px;border-radius:999px;background:rgba(32,48,43,.08);overflow:hidden">
        <div data-kokoro-progress-bar style="height:100%;width:0%;border-radius:inherit;background:#7f9f91;transition:width .2s ease"></div>
      </div>
      <div data-kokoro-progress-detail style="margin-top:7px;font-size:12px;line-height:1.55;color:var(--muted)"></div>`;
    row.appendChild(panel);
    return panel;
  }

  function setButtonState(tts){
    const button=document.querySelector('[data-action="prepare-kokoro-tts"]');
    if(!button)return;
    const busy=tts?.status==="loading"||tts?.status==="downloading";
    button.disabled=busy;
    if(tts?.status==="ready")button.textContent="重新检查";
    else if(tts?.status==="error")button.textContent="重新下载";
    else if(busy)button.textContent="准备中…";
    else button.textContent="准备语音模型";
  }

  function renderStatus(tts){
    lastStatus=tts||{};
    const panel=ensurePanel();
    if(!panel)return;
    const label=panel.querySelector("[data-kokoro-progress-label]");
    const percent=panel.querySelector("[data-kokoro-progress-percent]");
    const bar=panel.querySelector("[data-kokoro-progress-bar]");
    const detail=panel.querySelector("[data-kokoro-progress-detail]");
    const progress=clamp(tts?.progress);
    const file=clean(tts?.file).split(/[\\/]/).pop();
    const error=clean(tts?.error);

    if(bar)bar.style.width=`${progress}%`;
    if(percent)percent.textContent=(tts?.status==="downloading"||progress>0)?`${Math.round(progress)}%`:"";

    if(tts?.status==="ready"){
      if(label)label.textContent="本地自然语音模型已准备完成";
      if(percent)percent.textContent="100%";
      if(bar)bar.style.width="100%";
      if(detail)detail.textContent="之后可直接离线合成；已生成的语音仍会继续使用本地缓存。";
    }else if(tts?.status==="downloading"){
      if(label)label.textContent="正在下载本地语音模型";
      if(detail)detail.textContent=file?`当前文件：${file}`:"正在接收模型文件…";
    }else if(tts?.status==="loading"){
      if(label)label.textContent=progress>0?"模型文件已下载，正在加载…":"正在连接模型下载源…";
      if(detail)detail.textContent=file?`当前文件：${file}`:"第一次准备需要联网，页面可以继续正常使用。";
    }else if(tts?.status==="error"){
      if(label)label.textContent="自然语音模型准备失败";
      if(percent)percent.textContent="";
      if(bar)bar.style.width="0%";
      if(detail){
        detail.textContent=error?`具体原因：${error}`:"未获得具体错误信息，请点击“重新下载”再次尝试。";
        detail.style.color="#9a5d4b";
      }
    }else{
      if(label)label.textContent="首次使用时会下载本地语音模型";
      if(detail)detail.textContent="下载过程中会在这里显示当前文件和实时进度。";
    }
    setButtonState(tts);
  }

  async function getStatus(){
    const response=await fetch(`${API_ORIGIN}/api/tts/kokoro/status`,{cache:"no-store"});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.ok)throw new Error(payload?.error||`HTTP ${response.status}`);
    return payload.tts||{};
  }

  function stopPolling(){
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
  }

  async function poll(){
    stopPolling();
    try{
      const tts=await getStatus();
      renderStatus(tts);
      if(tts.status==="loading"||tts.status==="downloading"){
        pollTimer=setTimeout(poll,350);
      }
    }catch(err){
      const panel=ensurePanel();
      const detail=panel?.querySelector("[data-kokoro-progress-detail]");
      if(detail){detail.textContent=`状态读取失败：${clean(err?.message||err)}`;detail.style.color="#9a5d4b";}
    }
  }

  function beginPrepare(button){
    if(prepareRequest)return;
    renderStatus({status:"loading",progress:0,file:"",error:""});
    if(button)button.disabled=true;
    void poll();

    // Keep the long first-download request detached. The local server remains free
    // to answer /status while the worker downloads, so Settings can show progress.
    prepareRequest=fetch(`${API_ORIGIN}/api/tts/kokoro/prepare`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:"{}",
      cache:"no-store"
    }).then(async response=>{
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){
        const live=await getStatus().catch(()=>null);
        if(live)renderStatus(live);
        else renderStatus({status:"error",error:payload?.userError?.message||payload?.error||`HTTP ${response.status}`});
      }else{
        const live=await getStatus().catch(()=>payload?.tts||null);
        if(live)renderStatus(live);
      }
    }).catch(err=>{
      renderStatus({status:"error",error:clean(err?.message||err)||"无法连接本地语音服务"});
    }).finally(()=>{
      prepareRequest=null;
      void poll();
    });
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.('[data-action="prepare-kokoro-tts"]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    beginPrepare(button);
  },true);

  // Settings is re-rendered wholesale by app.js. Decorate each newly rendered row
  // once; unlike the old reset-control bug, this observer never rewrites an element
  // it already decorated.
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      if(!findTtsRow())return;
      ensurePanel();
      if(lastStatus)renderStatus(lastStatus);
      else void poll();
    });
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});

  if(findTtsRow()){
    ensurePanel();
    void poll();
  }
})();
