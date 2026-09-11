from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def repl(path,before,after):
    text=path.read_text(encoding='utf-8')
    count=text.count(before)
    if count!=1:
        raise SystemExit(f'{path}: expected 1 match, got {count}')
    path.write_text(text.replace(before,after,1),encoding='utf-8')

# lib/kokoro-tts.js
p=ROOT/'lib/kokoro-tts.js'
repl(p,
'''let worker = null;\nlet requestSeq = 0;\nconst pending = new Map();\nlet state = {\n  status: "idle",\n  progress: 0,\n  file: "",\n  error: "",\n  readyAt: "",\n  synthesizing: false,\n};\n''',
'''let worker = null;\nlet requestSeq = 0;\nconst pending = new Map();\nlet preparePromise = null;\nlet state = {\n  status: "idle",\n  phase: "idle",\n  progress: 0,\n  file: "",\n  loadedBytes: 0,\n  totalBytes: 0,\n  error: "",\n  errorCode: "",\n  readyAt: "",\n  synthesizing: false,\n};\n''')
repl(p,
'''      state = {\n        status: clean(next.status) || state.status,\n        progress: Number.isFinite(Number(next.progress)) ? Number(next.progress) : state.progress,\n        file: clean(next.file),\n        error: clean(next.error),\n        readyAt: clean(next.readyAt),\n        synthesizing: Boolean(next.synthesizing),\n      };\n''',
'''      state = {\n        status: clean(next.status) || state.status,\n        phase: clean(next.phase) || state.phase,\n        progress: Number.isFinite(Number(next.progress)) ? Number(next.progress) : state.progress,\n        file: clean(next.file),\n        loadedBytes: Number.isFinite(Number(next.loadedBytes)) ? Number(next.loadedBytes) : state.loadedBytes,\n        totalBytes: Number.isFinite(Number(next.totalBytes)) ? Number(next.totalBytes) : state.totalBytes,\n        error: clean(next.error),\n        errorCode: clean(next.errorCode),\n        readyAt: clean(next.readyAt),\n        synthesizing: Boolean(next.synthesizing),\n      };\n''')
repl(p,
'''async function prepare() {\n  await callWorker("prepare", {}, 15 * 60 * 1000);\n  return status();\n}\n''',
'''function startPrepare() {\n  if (state.status === "ready") return Promise.resolve(status());\n  if (preparePromise) return preparePromise;\n  state = { ...state, status: "loading", phase: "connecting", error: "", errorCode: "" };\n  preparePromise = callWorker("prepare", {}, 15 * 60 * 1000)\n    .then(() => status())\n    .catch(err => {\n      console.error("Kokoro prepare failed:", err?.stack || err?.message || err);\n      return status();\n    })\n    .finally(() => { preparePromise = null; });\n  return preparePromise;\n}\n\nasync function prepare() {\n  await startPrepare();\n  return status();\n}\n''')
repl(p,
'''  status,\n  prepare,\n  synthesize,\n''',
'''  status,\n  startPrepare,\n  prepare,\n  synthesize,\n''')

# lib/kokoro-worker.js
p=ROOT/'lib/kokoro-worker.js'
repl(p,
'''let state = {\n  status: "idle",\n  progress: 0,\n  file: "",\n  error: "",\n  readyAt: "",\n  synthesizing: false,\n};\n''',
'''let state = {\n  status: "idle",\n  phase: "idle",\n  progress: 0,\n  file: "",\n  loadedBytes: 0,\n  totalBytes: 0,\n  error: "",\n  errorCode: "",\n  readyAt: "",\n  synthesizing: false,\n};\n''')
repl(p,
'''  if (file) next.file = file;\n  if (eventStatus === "progress" || eventStatus === "download") {\n    next.status = "downloading";\n    const p = Number(event?.progress);\n    if (Number.isFinite(p)) next.progress = Math.max(0, Math.min(100, p));\n    else if (Number(event?.total) > 0 && Number(event?.loaded) >= 0) {\n      next.progress = Math.max(0, Math.min(100, Number(event.loaded) / Number(event.total) * 100));\n    }\n  } else if (eventStatus === "initiate" || eventStatus === "ready") {\n    if (next.status !== "downloading") next.status = "loading";\n  }\n''',
'''  if (file) next.file = file;\n  const loaded = Number(event?.loaded);\n  const total = Number(event?.total);\n  if (Number.isFinite(loaded) && loaded >= 0) next.loadedBytes = loaded;\n  if (Number.isFinite(total) && total > 0) next.totalBytes = total;\n  if (eventStatus === "progress" || eventStatus === "download") {\n    next.status = "downloading";\n    next.phase = "downloading";\n    const p = Number(event?.progress);\n    if (Number.isFinite(p)) next.progress = Math.max(0, Math.min(100, p));\n    else if (total > 0 && loaded >= 0) next.progress = Math.max(0, Math.min(100, loaded / total * 100));\n  } else if (eventStatus === "initiate") {\n    next.status = next.status === "downloading" ? next.status : "loading";\n    next.phase = "connecting";\n  } else if (eventStatus === "ready") {\n    next.status = next.status === "downloading" ? next.status : "loading";\n    next.phase = "loading";\n  }\n''')
repl(p,
'''  state = { ...state, status: "loading", progress: 0, file: "", error: "", readyAt: "" };\n''',
'''  state = { ...state, status: "loading", phase: "connecting", progress: 0, file: "", loadedBytes: 0, totalBytes: 0, error: "", errorCode: "", readyAt: "" };\n''')
repl(p,
'''      status: "ready",\n      progress: 100,\n      file: "",\n      error: "",\n      readyAt: new Date().toISOString(),\n''',
'''      status: "ready",\n      phase: "ready",\n      progress: 100,\n      file: "",\n      loadedBytes: state.totalBytes || state.loadedBytes,\n      error: "",\n      errorCode: "",\n      readyAt: new Date().toISOString(),\n''')
repl(p,
'''  })().catch(err => {\n    state = {\n      ...state,\n      status: "error",\n      progress: 0,\n      file: "",\n      error: clean(err?.message || err) || "Kokoro model failed to load",\n      readyAt: "",\n      synthesizing: false,\n    };\n''',
'''  })().catch(err => {\n    const raw = clean(err?.message || err) || "Kokoro model failed to load";\n    const code = clean(err?.cause?.code || err?.code);\n    const downloadLike = /fetch|network|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|403|404|huggingface/i.test(`${raw} ${code}`);\n    state = {\n      ...state,\n      status: "error",\n      phase: downloadLike ? "download-error" : "load-error",\n      progress: 0,\n      error: raw.slice(0, 500),\n      errorCode: code || (downloadLike ? "KOKORO_MODEL_DOWNLOAD_FAILED" : "KOKORO_MODEL_LOAD_FAILED"),\n      readyAt: "",\n      synthesizing: false,\n    };\n''')

# server-runtime.js
p=ROOT/'server-runtime.js'
repl(p,
'''async function handleKokoroPrepare(res) {\n  try {\n    const current = await kokoroTts.prepare();\n    return writeJson(res, 200, { ok: true, tts: current });\n  } catch (err) {\n    return writeJson(res, 503, {\n      ok: false,\n      code: err?.code || "KOKORO_PREPARE_FAILED",\n      error: "自然语音模型没有准备完成",\n      userError: {\n        title: "自然语音下载失败",\n        message: "请确认可以访问模型下载源后再试。已经下载的文件会继续保留，不需要从头安装 Python 环境。"\n      }\n    });\n  }\n}\n''',
'''async function handleKokoroPrepare(res) {\n  kokoroTts.startPrepare();\n  return writeJson(res, 202, { ok: true, started: true, tts: kokoroTts.status() });\n}\n''')

# public/app.js
p=ROOT/'public/app.js'
repl(p,
'''  async function refreshProviderStatus(silent=true){\n''',
'''  let kokoroPollTimer=null;\n\n  function formatBytes(value){\n    const n=Number(value);\n    if(!Number.isFinite(n)||n<=0)return "";\n    if(n>=1024*1024)return `${(n/1024/1024).toFixed(n>=100*1024*1024?0:1)} MB`;\n    if(n>=1024)return `${(n/1024).toFixed(1)} KB`;\n    return `${Math.round(n)} B`;\n  }\n\n  function updateKokoroProgressUi(tts){\n    if(!tts)return;\n    const progress=Math.max(0,Math.min(100,Number(tts.progress)||0));\n    const pill=document.getElementById("tts-status-pill");\n    const wrap=document.getElementById("tts-progress-wrap");\n    const bar=document.getElementById("tts-progress-bar");\n    const text=document.getElementById("tts-progress-text");\n    const file=document.getElementById("tts-progress-file");\n    const button=document.getElementById("tts-prepare-button");\n    if(pill){\n      pill.className=`pill ${tts.status==="ready"?"green":tts.status==="error"?"red":"amber"}`;\n      pill.textContent=tts.status==="ready"?"本地模型已就绪":tts.status==="error"?"准备失败":tts.status==="downloading"?"正在下载模型":tts.status==="loading"?"正在加载模型":"首次使用自动准备";\n    }\n    if(wrap)wrap.hidden=!["loading","downloading","error"].includes(tts.status);\n    if(bar)bar.style.width=`${progress}%`;\n    if(text){\n      if(tts.status==="downloading") text.textContent=`当前文件 ${Math.round(progress)}%`;\n      else if(tts.status==="loading") text.textContent=tts.phase==="connecting"?"正在连接模型下载源…":"下载完成后正在加载模型…";\n      else if(tts.status==="error") text.textContent="自然语音模型准备失败";\n      else text.textContent="";\n    }\n    if(file){\n      const name=String(tts.file||"").split(/[\\/]/).pop()||"";\n      const size=tts.totalBytes?`${formatBytes(tts.loadedBytes)} / ${formatBytes(tts.totalBytes)}`:"";\n      file.textContent=tts.status==="error"?`原因：${tts.error||tts.errorCode||"未知错误"}`:[name,size].filter(Boolean).join(" · ");\n    }\n    if(button){\n      button.disabled=tts.status==="downloading"||tts.status==="loading";\n      button.textContent=tts.status==="ready"?"重新检查":tts.status==="error"?"重新下载":"准备语音模型";\n    }\n  }\n\n  function stopKokoroPolling(){\n    if(kokoroPollTimer){clearTimeout(kokoroPollTimer);kokoroPollTimer=null;}\n  }\n\n  async function pollKokoroStatus(){\n    stopKokoroPolling();\n    try{\n      const payload=await api("/api/tts/kokoro/status");\n      const tts=payload.tts||{};\n      state.providerStatus={...(state.providerStatus||{}),tts};\n      if(state.route==="settings")updateKokoroProgressUi(tts);\n      if(tts.status==="ready"){toast("本地自然语音已准备完成");return;}\n      if(tts.status==="error"){\n        showNotice("自然语音模型准备失败",tts.error?`具体原因：${tts.error}`:"请检查模型下载网络后重试。","error");\n        return;\n      }\n      kokoroPollTimer=setTimeout(pollKokoroStatus,400);\n    }catch(err){showErrorNotice(err,"自然语音状态读取失败");}\n  }\n\n  async function refreshProviderStatus(silent=true){\n''')
repl(p,
'''            <span class="pill ${tts.status==="ready"?"green":tts.status==="error"?"red":"amber"}">${tts.status==="ready"?"本地模型已就绪":tts.status==="downloading"?"正在下载模型":"首次使用自动准备"}</span>\n            <button class="btn" data-action="prepare-kokoro-tts" ${tts.status==="downloading"||tts.status==="loading"?"disabled":""}>${tts.status==="ready"?"重新检查":"准备语音模型"}</button>\n          </div>\n        </div>\n''',
'''            <span id="tts-status-pill" class="pill ${tts.status==="ready"?"green":tts.status==="error"?"red":"amber"}">${tts.status==="ready"?"本地模型已就绪":tts.status==="error"?"准备失败":tts.status==="downloading"?"正在下载模型":tts.status==="loading"?"正在加载模型":"首次使用自动准备"}</span>\n            <button id="tts-prepare-button" class="btn" data-action="prepare-kokoro-tts" ${tts.status==="downloading"||tts.status==="loading"?"disabled":""}>${tts.status==="ready"?"重新检查":tts.status==="error"?"重新下载":"准备语音模型"}</button>\n          </div>\n          <div id="tts-progress-wrap" ${!["loading","downloading","error"].includes(tts.status)?"hidden":""} style="margin-top:14px;width:100%">\n            <div style="height:8px;border-radius:999px;background:rgba(30,45,40,.08);overflow:hidden"><div id="tts-progress-bar" style="height:100%;width:${Math.max(0,Math.min(100,Number(tts.progress)||0))}%;background:currentColor;opacity:.55;transition:width .25s ease"></div></div>\n            <div style="display:flex;justify-content:space-between;gap:12px;margin-top:7px;font-size:12px;color:var(--muted)"><span id="tts-progress-text">${tts.status==="downloading"?`当前文件 ${Math.round(Number(tts.progress)||0)}%`:tts.status==="error"?"自然语音模型准备失败":"正在连接或加载模型…"}</span><span id="tts-progress-file">${escapeHtml(tts.status==="error"?(tts.error||tts.errorCode||""):(tts.file||""))}</span></div>\n          </div>\n        </div>\n''')
repl(p,
'''    if(action==="prepare-kokoro-tts"){\n      toast("正在准备本地自然语音，首次下载可能需要一点时间…");\n      try{\n        await api("/api/tts/kokoro/prepare",{method:"POST",body:{}});\n        toast("本地自然语音已准备完成");\n        await refreshProviderStatus(true);\n      }catch(err){\n        showErrorNotice(err,"自然语音下载失败");\n      }\n      return;\n    }\n''',
'''    if(action==="prepare-kokoro-tts"){\n      toast("开始准备本地自然语音；下载进度会显示在当前页面。");\n      try{\n        const payload=await api("/api/tts/kokoro/prepare",{method:"POST",body:{}});\n        const tts=payload.tts||{status:"loading",progress:0};\n        state.providerStatus={...(state.providerStatus||{}),tts};\n        updateKokoroProgressUi(tts);\n        void pollKokoroStatus();\n      }catch(err){showErrorNotice(err,"自然语音下载失败");}\n      return;\n    }\n''')

print('Applied Kokoro progress and diagnostics patch')
