from pathlib import Path

root = Path('.')
server = (root/'server.js').read_text(encoding='utf-8')
app = (root/'public/app.js').read_text(encoding='utf-8')
css = (root/'public/styles.css').read_text(encoding='utf-8')
readme = (root/'README.md').read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# ---------- server: durable desktop paths ----------
server = replace_once(server,
'''const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const GENERATED_DIR = path.join(ROOT, "generated");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");''',
'''const PUBLIC_DIR = path.join(ROOT, "public");
const LEGACY_DATA_DIR = path.join(ROOT, "data");
const LEGACY_GENERATED_DIR = path.join(ROOT, "generated");
const DATA_DIR = process.env.LEXIFLOW_DATA_DIR || LEGACY_DATA_DIR;
const GENERATED_DIR = process.env.LEXIFLOW_GENERATED_DIR || (process.env.LEXIFLOW_DATA_DIR ? path.join(DATA_DIR, "generated") : LEGACY_GENERATED_DIR);
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LEARNING_FILE = path.join(DATA_DIR, "learning-data.json");''', 'runtime dirs')

server = replace_once(server,
'''const LOOKUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKUP_CACHE_SCHEMA = "v4.2-audit1";''',
'''const LOOKUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKUP_CACHE_SCHEMA = "v4.3-desktop";
const DEFAULT_CODEX_MODEL = "gpt-5.6-luna";
const DEFAULT_CODEX_REASONING_EFFORT = "medium";''', 'cache/defaults')

server = replace_once(server,
'''async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function loadSettings() {''',
'''async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tempFile, filePath);
}

function defaultLearningData() {
  return {
    version: 1,
    cards: [],
    activities: [],
    settings: { dailyGoal: 5 },
    createdAt: new Date().toISOString(),
  };
}

async function loadLearningData() {
  try {
    const parsed = JSON.parse(await fsp.readFile(LEARNING_FILE, "utf8"));
    if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.activities)) throw new Error("INVALID_DATA");
    return {
      ...defaultLearningData(),
      ...parsed,
      settings: { dailyGoal: 5, ...(parsed.settings || {}) },
    };
  } catch {
    return defaultLearningData();
  }
}

async function saveLearningData(value) {
  if (!value || !Array.isArray(value.cards) || !Array.isArray(value.activities)) {
    const err = new Error("学习数据格式不正确");
    err.code = "LEARNING_DATA_INVALID";
    throw err;
  }
  const clean = {
    ...defaultLearningData(),
    ...value,
    settings: { dailyGoal: 5, ...(value.settings || {}) },
  };
  await writeJsonAtomic(LEARNING_FILE, clean);
  return clean;
}

function getElectronSafeStorage() {
  if (process.env.LEXIFLOW_DESKTOP !== "1") return null;
  try {
    const electron = require("electron");
    const safeStorage = electron && electron.safeStorage;
    return safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
  } catch {
    return null;
  }
}

async function migrateLegacyRuntimeData() {
  if (path.resolve(DATA_DIR) === path.resolve(LEGACY_DATA_DIR)) return;
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(GENERATED_DIR, { recursive: true });

  for (const name of ["settings.json", "dictionary-cache.json"]) {
    const from = path.join(LEGACY_DATA_DIR, name);
    const to = path.join(DATA_DIR, name);
    try {
      if (!fs.existsSync(to) && fs.existsSync(from)) await fsp.copyFile(from, to);
    } catch (err) {
      console.warn(`legacy ${name} migration skipped:`, err.message);
    }
  }

  try {
    if (fs.existsSync(LEGACY_GENERATED_DIR)) {
      const names = await fsp.readdir(LEGACY_GENERATED_DIR);
      for (const name of names) {
        if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
        const from = path.join(LEGACY_GENERATED_DIR, name);
        const to = path.join(GENERATED_DIR, name);
        if (!fs.existsSync(to)) await fsp.copyFile(from, to);
      }
    }
  } catch (err) {
    console.warn("legacy generated image migration skipped:", err.message);
  }
}

async function loadSettings() {''', 'learning persistence helpers')

server = replace_once(server,
'''  const defaults = {
    merriamWebsterLearnersKey: "",
    codexModel: "",
    codexReasoningEffort: ""
  };
  try {
    const parsed = JSON.parse(await fsp.readFile(SETTINGS_FILE, "utf8"));
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}''',
'''  const defaults = {
    merriamWebsterLearnersKey: "",
    codexModel: DEFAULT_CODEX_MODEL,
    codexReasoningEffort: DEFAULT_CODEX_REASONING_EFFORT,
  };
  try {
    const parsed = JSON.parse(await fsp.readFile(SETTINGS_FILE, "utf8"));
    let key = String(parsed.merriamWebsterLearnersKey || "");
    if (!key && parsed.merriamWebsterLearnersKeyEncrypted) {
      const safeStorage = getElectronSafeStorage();
      if (safeStorage) {
        try {
          key = safeStorage.decryptString(Buffer.from(String(parsed.merriamWebsterLearnersKeyEncrypted), "base64"));
        } catch (err) {
          console.warn("dictionary key decrypt failed:", err.message);
        }
      }
    }
    return { ...defaults, ...parsed, merriamWebsterLearnersKey: key };
  } catch {
    return defaults;
  }
}''', 'settings defaults')

old_save = '''  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${SETTINGS_FILE}.tmp`;
  try {
    await fsp.writeFile(tempFile, JSON.stringify(clean, null, 2), "utf8");
    await fsp.rename(tempFile, SETTINGS_FILE);
  } catch (err) {
    try { await fsp.unlink(tempFile); } catch {}
    const wrapped = new Error("本地设置文件无法写入");
    wrapped.code = "SETTINGS_WRITE_FAILED";
    wrapped.cause = err;
    throw wrapped;
  }
  return clean;'''
new_save = '''  try {
    const diskValue = { ...clean };
    const safeStorage = getElectronSafeStorage();
    if (safeStorage && clean.merriamWebsterLearnersKey) {
      diskValue.merriamWebsterLearnersKeyEncrypted = safeStorage.encryptString(clean.merriamWebsterLearnersKey).toString("base64");
      delete diskValue.merriamWebsterLearnersKey;
    }
    await writeJsonAtomic(SETTINGS_FILE, diskValue);
  } catch (err) {
    const wrapped = new Error("本地设置文件无法写入");
    wrapped.code = "SETTINGS_WRITE_FAILED";
    wrapped.cause = err;
    throw wrapped;
  }
  return clean;'''
server = replace_once(server, old_save, new_save, 'settings atomic encrypted')

# Add learning-data API before status endpoint.
server = replace_once(server,
'''    if (req.method === "GET" && url.pathname === "/api/status") {''',
'''    if (req.method === "GET" && url.pathname === "/api/learning-data") {
      const data = await loadLearningData();
      return sendJson(res, 200, {
        ok: true,
        data,
        hasStoredData: fs.existsSync(LEARNING_FILE),
        storage: process.env.LEXIFLOW_DESKTOP === "1" ? "desktop" : "local-file",
      });
    }

    if (req.method === "POST" && url.pathname === "/api/learning-data") {
      const body = await readJsonBody(req, 8 * 1024 * 1024);
      try {
        const data = await saveLearningData(body.data);
        return sendJson(res, 200, { ok: true, data });
      } catch (err) {
        return sendJson(res, 400, {
          ok: false,
          code: err.code || "LEARNING_DATA_SAVE_FAILED",
          error: "学习数据没有保存成功",
          userError: { code: err.code || "LEARNING_DATA_SAVE_FAILED", title: "学习进度没有保存", message: "请稍后重试。当前页面内容仍然保留。" },
        });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/status") {''', 'learning api')

# Add storage metadata to status response.
server = replace_once(server,
'''        dictionary: {
          provider: "Merriam-Webster's Learner's Dictionary",''',
'''        storage: {
          mode: process.env.LEXIFLOW_DESKTOP === "1" ? "desktop" : "local-file",
          persistent: true,
        },
        dictionary: {
          provider: "Merriam-Webster's Learner's Dictionary",''', 'status storage')

# Refactor server startup so Electron can host it inside the app process.
old_bottom = '''server.listen(PORT, HOST, () => {
  const address = `http://${HOST}:${PORT}`;
  console.log("");
  console.log("LexiFlow 本地服务 v4.2 已启动");
  console.log(`地址: ${address}`);
  console.log(`Codex 认证: ${CODEX_AUTH}`);
  console.log(`Codex 可选配置: ${CODEX_CONFIG}`);
  console.log("关闭此窗口即可停止本地服务。");
  console.log("");

  if (process.platform === "win32" && process.env.LEXIFLOW_NO_OPEN !== "1") {
    exec(`start "" "${address}"`);
  }
});'''
new_bottom = '''async function startServer() {
  await migrateLegacyRuntimeData();
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(GENERATED_DIR, { recursive: true });

  return await new Promise((resolve, reject) => {
    const onError = err => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = `http://${HOST}:${PORT}`;
      console.log("");
      console.log("LexiFlow 本地服务已启动");
      console.log(`地址: ${address}`);
      console.log("");

      if (process.platform === "win32" && process.env.LEXIFLOW_NO_OPEN !== "1") {
        exec(`start "" "${address}"`);
      }
      resolve({ server, address });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(PORT, HOST);
  });
}

function stopServer() {
  try {
    if (server.listening) server.close();
  } catch {}
}

if (require.main === module) {
  startServer().catch(err => {
    console.error("LexiFlow startup failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { startServer, stopServer };'''
server = replace_once(server, old_bottom, new_bottom, 'server startup')

# ---------- renderer: migrate away from browser localStorage ----------
app = replace_once(app, '    data: loadData(),', '    data: defaultData(),', 'state default')

old_storage = '''  function loadData(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultData();
      const parsed = JSON.parse(raw);
      return { ...defaultData(), ...parsed, settings:{dailyGoal:5,...(parsed.settings||{})} };
    }catch{
      return defaultData();
    }
  }

  function saveData(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }'''
new_storage = '''  function normalizeLearningData(parsed){
    return { ...defaultData(), ...(parsed||{}), settings:{dailyGoal:5,...(parsed?.settings||{})} };
  }

  function loadLegacyBrowserData(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return null;
      return normalizeLearningData(JSON.parse(raw));
    }catch{return null;}
  }

  let persistenceReady=false;
  let persistenceQueue=Promise.resolve();

  function saveData(){
    if(!persistenceReady)return;
    const snapshot=JSON.parse(JSON.stringify(state.data));
    persistenceQueue=persistenceQueue
      .catch(()=>{})
      .then(()=>api("/api/learning-data",{method:"POST",body:{data:snapshot}}))
      .catch(err=>{
        console.error("learning data save failed",err);
        if(!state.notice) showNotice("学习进度暂未保存","本机存储暂时不可用，请稍后重试。","error");
      });
  }

  async function hydrateLearningData(){
    const legacy=loadLegacyBrowserData();
    const payload=await api("/api/learning-data");
    if(payload.hasStoredData){
      state.data=normalizeLearningData(payload.data);
    }else if(legacy && (legacy.cards.length||legacy.activities.length)){
      state.data=legacy;
      await api("/api/learning-data",{method:"POST",body:{data:state.data}});
      try{localStorage.removeItem(STORAGE_KEY);}catch{}
    }else{
      state.data=normalizeLearningData(payload.data);
    }
    persistenceReady=true;
  }'''
app = replace_once(app, old_storage, new_storage, 'renderer persistence')

# Custom, non-prototype file picker and less explanatory text.
app = replace_once(app,
'''        <div class="upload-zone visual-upload-zone"><div>使用自己的图片</div><span>支持本地上传，适合已经有明确记忆画面的情况</span><input id="visual-file" type="file" accept="image/*" /></div>''',
'''        <div class="upload-zone visual-upload-zone">
          <div class="visual-upload-copy"><strong>已有记忆图片？</strong></div>
          <label class="file-picker-button">选择图片<input id="visual-file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        </div>''', 'file picker')

app = app.replace('每一步都由你显式完成。', '')
app = app.replace('无需填写场景。系统会结合当前词义、例句和具体语义自动构图，并主动避开容易混淆的其它含义。', '根据当前词义和例句自动构图。')
app = app.replace('填写后会优先按照你的场景生成；留空则继续使用系统自动构图。', '')
app = app.replace('配置词典与 AI 服务。认证仍由本机 Codex 安全管理，LexiFlow 不读取你的登录凭据。', '词典与 AI 服务只需配置一次。')
app = app.replace('这是 LexiFlow 自己的运行覆盖项，只影响 LexiFlow 的 AI 调用，不会修改你本机 Codex 的全局配置。', '默认使用 GPT-5.6 Luna，中等思考强度。')
app = app.replace('“跟随默认”使用当前 Codex 默认模型。查词、中文纠错和图片任务会自动优先使用快速推理，造句反馈使用你选择的思考强度。', '')
app = app.replace('视觉联想阶段复用上面的模型/思考强度和同一套 Codex 认证。图片能力仍取决于当前 Codex 环境和所选模型；失败时可以上传本地图或跳过。', '使用当前 AI 配置生成视觉联想。')
app = app.replace('用于首页进度展示，不强制限制学习。', '')

# Replace final boot sequence with durable-data hydration.
old_boot = '''  render();

  if(location.protocol === "file:"){
    api("/api/health")
      .then(()=>{ location.replace("http://127.0.0.1:4177/"); })
      .catch(err=>{
        showErrorNotice(err,"本地服务没有启动");
        state.providerStatus={ok:false,serviceUnavailable:true,error:err.message};
        render();
      });
  }else{
    refreshProviderStatus(true);
  }
})();'''
new_boot = '''  async function initializeApp(){
    try{
      if(location.protocol === "file:"){
        await api("/api/health");
        location.replace("http://127.0.0.1:4177/");
        return;
      }
      await hydrateLearningData();
      render();
      await refreshProviderStatus(true);
    }catch(err){
      state.providerStatus={ok:false,serviceUnavailable:true,error:err.message};
      showErrorNotice(err,"LexiFlow 暂时无法启动");
      render();
    }
  }

  initializeApp();
})();'''
app = replace_once(app, old_boot, new_boot, 'renderer boot')

# ---------- CSS: custom upload control + reduce explanatory clutter ----------
css += r'''

/* Desktop app persistence / refined upload control */
.visual-upload-zone{
  min-height:68px;
  padding:14px 16px!important;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  border-style:solid;
  background:#f8fafc;
}
.visual-upload-copy strong{font-size:13px;color:#43516a}
.file-picker-button{
  min-height:40px;
  padding:0 16px;
  border:1px solid #d1dbea;
  border-radius:11px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  background:#fff;
  color:#354258;
  font-size:13px;
  font-weight:800;
  cursor:pointer;
  transition:border-color .16s ease,background .16s ease,transform .16s ease;
}
.file-picker-button:hover{border-color:#aebfda;background:#f4f7fb;transform:translateY(-1px)}
.file-picker-button input{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
.visual-scene-help:empty,.section-title p:empty,.setting-row p:empty{display:none}
.study-shell .stage-rail .section-title{margin-bottom:8px}
.settings-list .setting-row{padding:18px 20px}
.settings-list .setting-row p{max-width:720px;line-height:1.45}
@media(max-width:760px){.visual-upload-zone{align-items:stretch;flex-direction:column}.file-picker-button{width:100%}}
'''

# ---------- README ----------
desktop_intro = '''# LexiFlow Desktop\n\nLexiFlow 现在以 **Windows 桌面应用** 为主运行形态。学习数据、设置和生成图片不再依赖浏览器 localStorage。\n\n- 学习数据：保存到 Electron `userData/app-data/learning-data.json`\n- 词典/AI 设置：保存到 Electron `userData/app-data/settings.json`\n- Merriam-Webster Key：在 Electron 环境下使用系统安全存储加密后落盘\n- 生成图片：保存到 Electron `userData/app-data/generated/`\n- 默认 Codex：`gpt-5.6-luna`\n- 默认思考强度：`medium`\n- 首次启动会尝试迁移旧项目目录里的设置、缓存和生成图片；浏览器 localStorage 中已有的学习卡也会在第一次打开新版本时自动迁移到本地文件。\n\n开发运行：\n\n```powershell\nnpm install\nnpm run app\n```\n\n构建 Windows 安装包 / 便携版：\n\n```powershell\nnpm run build:win\n```\n\n---\n\n'''
if not readme.startswith('# LexiFlow Desktop'):
    readme = desktop_intro + readme

(root/'server.js').write_text(server, encoding='utf-8')
(root/'public/app.js').write_text(app, encoding='utf-8')
(root/'public/styles.css').write_text(css, encoding='utf-8')
(root/'README.md').write_text(readme, encoding='utf-8')
