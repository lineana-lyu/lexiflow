from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, before: str, after: str):
    text = path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {before[:120]!r}")
    path.write_text(text.replace(before, after, 1), encoding="utf-8")


def regex_once(path: Path, pattern: str, replacement: str):
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: regex expected one match, got {count}: {pattern[:120]!r}")
    path.write_text(updated, encoding="utf-8")


server = ROOT / "server-runtime.js"
replace_once(
    server,
    'const chattts = require("./lib/chattts");',
    'const kokoroTts = require("./lib/kokoro-tts");',
)

kokoro_handler = r'''async function handleKokoroTts(res, body) {
  let parsed;
  try {
    parsed = parseJsonBuffer(body);
  } catch {
    return writeJson(res, 400, { ok: false, code: "INVALID_JSON", error: "请求格式不正确" });
  }
  const text = clean(parsed.text).slice(0, 600);
  if (!text) return writeJson(res, 400, { ok: false, code: "KOKORO_EMPTY", error: "没有可朗读的内容" });
  try {
    const audio = await kokoroTts.synthesize(text, { voice: parsed.voice, speed: parsed.speed });
    return writeJson(res, 200, {
      ok: true,
      audioDataUrl: audio.dataUrl,
      cacheHit: audio.cacheHit,
      voice: audio.voice,
      speed: audio.speed,
      engine: "kokoro-82m",
    });
  } catch (err) {
    console.warn("Kokoro TTS unavailable:", err?.message || err);
    return writeJson(res, 503, {
      ok: false,
      code: err?.code || "KOKORO_UNAVAILABLE",
      error: "本地自然语音当前不可用",
      userError: {
        title: "自然语音没有准备完成",
        message: "Kokoro 首次使用需要联网下载本地模型。请检查网络后重试；下载完成后即可离线使用。"
      }
    });
  }
}

async function handleKokoroPrepare(res) {
  try {
    const current = await kokoroTts.prepare();
    return writeJson(res, 200, { ok: true, tts: current });
  } catch (err) {
    return writeJson(res, 503, {
      ok: false,
      code: err?.code || "KOKORO_PREPARE_FAILED",
      error: "自然语音模型没有准备完成",
      userError: {
        title: "自然语音下载失败",
        message: "请确认可以访问模型下载源后再试。已经下载的文件会继续保留，不需要从头安装 Python 环境。"
      }
    });
  }
}

'''
regex_once(
    server,
    r'async function handleChatTts\(res, body\) \{.*?\n\}\n\n(?=function forward\()',
    kokoro_handler,
)

old_route = '''    if (req.method === "POST" && url.pathname === "/api/tts/chattts") {
      try {
        const body = await readBody(req, 64 * 1024);
        return await handleChatTts(res, body);
      } catch (err) {
        return writeJson(res, 500, { ok: false, code: err?.code || "CHATTTS_FAILED", error: "自定义语音没有完成" });
      }
    }

'''
new_route = '''    if (req.method === "GET" && url.pathname === "/api/tts/kokoro/status") {
      return writeJson(res, 200, { ok: true, tts: kokoroTts.status() });
    }

    if (req.method === "POST" && url.pathname === "/api/tts/kokoro/prepare") {
      return await handleKokoroPrepare(res);
    }

    if (req.method === "POST" && url.pathname === "/api/tts/kokoro") {
      try {
        const body = await readBody(req, 64 * 1024);
        return await handleKokoroTts(res, body);
      } catch (err) {
        return writeJson(res, 500, { ok: false, code: err?.code || "KOKORO_FAILED", error: "本地自然语音没有完成" });
      }
    }

'''
replace_once(server, old_route, new_route)
replace_once(
    server,
    '''          exampleHydration: true,
        };
        writeJson(res, upstreamRes.statusCode || 200, payload);''',
    '''          exampleHydration: true,
        };
        payload.tts = kokoroTts.status();
        writeJson(res, upstreamRes.statusCode || 200, payload);''',
)
replace_once(server, 'function stopServer() {\n  chattts.stop();\n', 'function stopServer() {\n')

app = ROOT / "public" / "app.js"
replace_once(app, 'settings: { dailyGoal: 5 },', 'settings: { dailyGoal: 5, ttsVoice: "af_bella" },')
replace_once(app, 'settings:{dailyGoal:5,...(parsed?.settings||{})}', 'settings:{dailyGoal:5,ttsVoice:"af_bella",...(parsed?.settings||{})}')
replace_once(app, 'settings:{dailyGoal:5,...(parsed.settings||{})}', 'settings:{dailyGoal:5,ttsVoice:"af_bella",...(parsed.settings||{})}')
replace_once(app, '    const runtime=codex?.runtimeTest||{};\n', '    const runtime=codex?.runtimeTest||{};\n    const tts=status?.tts||{};\n')

voice_row = '''
        <div class="setting-row" style="align-items:flex-start">
          <div style="min-width:300px;flex:1">
            <h3>本地自然发音</h3>
            <p>Kokoro-82M 本地语音 · 真人词典/Wikimedia 发音仍优先。首次使用会自动下载模型，完成后可离线使用，不需要 Python 或 Windows 系统音色。</p>
            ${tts.status==="downloading"?`<p>模型下载中${Number.isFinite(Number(tts.progress))?` · ${Math.round(Number(tts.progress))}%`:""}</p>`:tts.status==="error"?`<p>最近错误：${escapeHtml(tts.error||"模型没有准备完成")}</p>`:""}
          </div>
          <div class="setting-actions-inline" style="align-items:flex-end;flex-wrap:wrap">
            <div class="field" style="min-width:210px">
              <label>合成音色</label>
              <select class="select" id="tts-voice">
                ${[
                  ["af_bella","美式女声 · Bella"],
                  ["af_heart","美式女声 · Heart"],
                  ["af_nicole","美式女声 · Nicole"],
                  ["am_michael","美式男声 · Michael"],
                  ["bf_emma","英式女声 · Emma"],
                  ["bm_george","英式男声 · George"]
                ].map(([id,label])=>`<option value="${id}" ${state.data.settings.ttsVoice===id?"selected":""}>${label}</option>`).join("")}
              </select>
            </div>
            <span class="pill ${tts.status==="ready"?"green":tts.status==="error"?"red":"amber"}">${tts.status==="ready"?"本地模型已就绪":tts.status==="downloading"?"正在下载模型":"首次使用自动准备"}</span>
            <button class="btn" data-action="prepare-kokoro-tts" ${tts.status==="downloading"||tts.status==="loading"?"disabled":""}>${tts.status==="ready"?"重新检查":"准备语音模型"}</button>
          </div>
        </div>
'''
replace_once(
    app,
    '''        <div class="setting-row">
          <div><h3>每日学习目标</h3><p></p></div>
          <select class="select" id="daily-goal" style="width:130px">${[3,5,8,10,15].map(n=>`<option value="${n}" ${state.data.settings.dailyGoal===n?"selected":""}>${n} 个词</option>`).join("")}</select>
        </div>
''',
    '''        <div class="setting-row">
          <div><h3>每日学习目标</h3><p></p></div>
          <select class="select" id="daily-goal" style="width:130px">${[3,5,8,10,15].map(n=>`<option value="${n}" ${state.data.settings.dailyGoal===n?"selected":""}>${n} 个词</option>`).join("")}</select>
        </div>
''' + voice_row,
)

replace_once(
    app,
    '    const commitDom=()=>{app.innerHTML=html;bind();};',
    '    const commitDom=()=>{document.documentElement.dataset.lexiflowTtsVoice=state.data.settings.ttsVoice||"af_bella";app.innerHTML=html;bind();};',
)
replace_once(
    app,
    '    if(goal) goal.addEventListener("change",e=>{state.data.settings.dailyGoal=Number(e.target.value);saveData();toast("每日目标已更新");});\n',
    '    if(goal) goal.addEventListener("change",e=>{state.data.settings.dailyGoal=Number(e.target.value);saveData();toast("每日目标已更新");});\n\n    const ttsVoice=document.getElementById("tts-voice");\n    if(ttsVoice) ttsVoice.addEventListener("change",e=>{\n      state.data.settings.ttsVoice=String(e.target.value||"af_bella");\n      document.documentElement.dataset.lexiflowTtsVoice=state.data.settings.ttsVoice;\n      try{localStorage.setItem("lexiflow-tts-voice",state.data.settings.ttsVoice);}catch{}\n      saveData();toast("发音音色已更新");\n    });\n',
)
replace_once(
    app,
    '    if(action==="export-data"){',
    '''    if(action==="prepare-kokoro-tts"){
      toast("正在准备本地自然语音，首次下载可能需要一点时间…");
      try{
        await api("/api/tts/kokoro/prepare",{method:"POST",body:{}});
        toast("本地自然语音已准备完成");
        await refreshProviderStatus(true);
      }catch(err){showErrorNotice(err,"自然语音没有准备完成");}
      return;
    }
    if(action==="export-data"){''',
)

index = ROOT / "public" / "index.html"
replace_once(index, '<script src="./chattts-voice.js"></script>', '<script src="./kokoro-voice.js"></script>')

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
check = package["scripts"]["check"]
check = check.replace("node --check lib/chattts.js", "node --check lib/kokoro-tts.js")
check = check.replace("node --check public/chattts-voice.js", "node --check public/kokoro-voice.js")
package["scripts"]["check"] = check
package["build"]["extraResources"] = [
    item for item in package["build"].get("extraResources", [])
    if item.get("from") != "resources/chattts-voice"
]
package["build"]["asarUnpack"] = ["node_modules/onnxruntime-node/**/*"]
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Patched LexiFlow to use Kokoro local TTS")
