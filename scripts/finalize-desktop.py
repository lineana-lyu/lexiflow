from pathlib import Path

root=Path('.')
server=(root/'server.js').read_text(encoding='utf-8')
app=(root/'public/app.js').read_text(encoding='utf-8')
electron=(root/'electron-main.js').read_text(encoding='utf-8')
css=(root/'public/styles.css').read_text(encoding='utf-8')

def one(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old,new,1)

# Server: appData is the durable runtime CWD for Codex in packaged Electron.
server=one(server,
'''const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LEARNING_FILE = path.join(DATA_DIR, "learning-data.json");''',
'''const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LEARNING_FILE = path.join(DATA_DIR, "learning-data.json");
const RUNTIME_CWD = process.env.LEXIFLOW_RUNTIME_CWD || DATA_DIR;''','runtime cwd')

server=one(server,
'''  for (const name of ["settings.json", "dictionary-cache.json"]) {''',
'''  for (const name of ["settings.json", "dictionary-cache.json", "learning-data.json"]) {''','legacy learning migration')

server=one(server,
'''    return { ...defaults, ...parsed, merriamWebsterLearnersKey: key };''',
'''    return {
      ...defaults,
      ...parsed,
      merriamWebsterLearnersKey: key,
      codexModel: String(parsed.codexModel || "").trim() || DEFAULT_CODEX_MODEL,
      codexReasoningEffort: String(parsed.codexReasoningEffort || "").trim().toLowerCase() || DEFAULT_CODEX_REASONING_EFFORT,
    };''','blank defaults')

server=one(server,
'''    cwd = ROOT,
    timeoutMs = 90000,''',
'''    cwd = RUNTIME_CWD,
    timeoutMs = 90000,''','codex cwd')

server=server.replace('version: "4.2",','version: "0.5.0-desktop",',1)

# Electron: configure persistent paths before ready and keep server alive through renderer unload.
electron=one(electron,
'''let mainWindow = null;
let backend = null;

function configureRuntimePaths() {''',
'''let mainWindow = null;
let backend = null;
let runtimePaths = null;

function configureRuntimePaths() {''','runtime var')
electron=one(electron,
'''  process.env.LEXIFLOW_DATA_DIR = appDataDir;
  process.env.LEXIFLOW_GENERATED_DIR = generatedDir;''',
'''  process.env.LEXIFLOW_DATA_DIR = appDataDir;
  process.env.LEXIFLOW_GENERATED_DIR = generatedDir;
  process.env.LEXIFLOW_RUNTIME_CWD = appDataDir;''','runtime env')
electron=one(electron,
'''async function createWindow() {
  const runtimePaths = configureRuntimePaths();
  backend = require("./server");''',
'''async function createWindow() {
  backend = require("./server");''','create window paths')
electron=one(electron,
'''app.whenReady().then(createWindow).catch(err => {''',
'''runtimePaths = configureRuntimePaths();

app.whenReady().then(createWindow).catch(err => {''','pre-ready paths')
electron=one(electron,
'''app.on("before-quit", () => {
  try {
    backend?.stopServer?.();
  } catch {}
});''',
'''app.on("will-quit", () => {
  try {
    backend?.stopServer?.();
  } catch {}
});''','will quit')

# Renderer: reduce microcopy, app defaults wording, and repair stale image references gracefully.
replacements={
'不需要填写任何场景。系统会根据当前词义和例句自动设计一张容易记住的画面；只有你想指定人物、地点或动作时，才需要展开自定义场景。':'根据当前词义和例句自动构图。',
'先回忆中文释义，再查看答案。完成这一步后才会真正进入后续复习计划。':'先回忆中文释义，再查看答案。',
'先学少量高质量单词，再用主动回忆和复习巩固。':'',
'输入英文或中文，LexiFlow 会自动识别、纠错并整理成适合学习的单词卡。':'',
'只显示已经到期的卡片；复习结果会决定下一次到期时间。':'',
'查看、搜索和管理已经保存的学习卡片。':'',
'只统计本地浏览器里的真实操作记录。':'',
'词典与 AI 服务只需配置一次。':'',
'提供英文词条、词性、例句、音标和美式发音。由 Merriam-Webster Learner\'s Dictionary 提供数据。当前：':'Merriam-Webster Learner\'s Dictionary · ',
'默认使用 GPT-5.6 Luna，中等思考强度。':'默认：GPT-5.6 Luna · 中',
'使用当前 AI 配置生成视觉联想。':'',
'不会导出词典 Key 或 Codex 凭据。':'',
'从 LexiFlow 导出的 JSON 恢复学习数据。':'',
'删除浏览器里的学习数据；不会删除 Codex 配置。':'删除全部单词与学习记录。',
}
for old,new in replacements.items():
    if old in app:
        app=app.replace(old,new)

app=app.replace('跟随 Codex 默认${codex?.model?` · ${escapeHtml(codex.model)}`:""}', '应用默认 · gpt-5.6-luna')
app=app.replace('跟随模型 / Codex 默认', '应用默认 · 中')

app=one(app,
'''${(card.imageData||card.imageUrl)?`<div class="visual-preview"><img src="${card.imageData||card.imageUrl}" alt="${escapeHtml(card.word)} 的视觉联想图片" /></div>`:""}''',
'''${(card.imageData||card.imageUrl)?`<div class="visual-preview"><img class="visual-memory-image" data-card-id="${escapeHtml(card.id)}" src="${card.imageData||card.imageUrl}" alt="${escapeHtml(card.word)} 的视觉联想图片" /></div>`:""}''','visual image class')

anchor='''    const visualFile=document.getElementById("visual-file");
    if(visualFile) visualFile.addEventListener("change",e=>{'''
insert='''    document.querySelectorAll(".visual-memory-image").forEach(img=>img.addEventListener("error",()=>{
      const cardId=img.dataset.cardId;
      const c=getCard(cardId);
      if(!c)return;
      c.imageData="";
      c.imageUrl="";
      c.imageGeneration={
        status:"error",
        message:"原图片文件已不在本机，请重新生成或选择一张图片。",
        code:"IMAGE_MISSING",
        finishedAt:new Date().toISOString()
      };
      c.updatedAt=new Date().toISOString();
      saveData();
      if(state.study?.cardId===cardId) render();
    }));

    const visualFile=document.getElementById("visual-file");
    if(visualFile) visualFile.addEventListener("change",e=>{'''
app=one(app,anchor,insert,'missing image handler')

# Flush the latest learning snapshot while the embedded server is still alive.
app=one(app,
'''  async function initializeApp(){''',
'''  window.addEventListener("beforeunload",()=>{
    if(!persistenceReady)return;
    try{
      const body=JSON.stringify({data:state.data});
      navigator.sendBeacon("/api/learning-data",new Blob([body],{type:"application/json"}));
    }catch{}
  });

  async function initializeApp(){''','beacon flush')

css += '''\n/* Compact product copy */\n.page-head p:empty,.auto-visual-copy p:empty,.setting-row p:empty{display:none}\n.settings-list .setting-row p{font-size:12px;color:#7c899a}\n.visual-memory-image{display:block}\n'''

(root/'server.js').write_text(server,encoding='utf-8')
(root/'public/app.js').write_text(app,encoding='utf-8')
(root/'electron-main.js').write_text(electron,encoding='utf-8')
(root/'public/styles.css').write_text(css,encoding='utf-8')
