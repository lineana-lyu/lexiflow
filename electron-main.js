const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

app.setName("LexiFlow");
if (process.platform === "win32") app.setAppUserModelId("com.lexiflow.desktop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let backend = null;
let runtimePaths = null;

function configureRuntimePaths() {
  const userData = app.getPath("userData");
  const appDataDir = path.join(userData, "app-data");
  const generatedDir = path.join(appDataDir, "generated");
  const sessionDir = path.join(userData, "chromium-session");
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  app.setPath("sessionData", sessionDir);
  process.env.LEXIFLOW_DESKTOP = "1";
  process.env.LEXIFLOW_NO_OPEN = "1";
  process.env.LEXIFLOW_DATA_DIR = appDataDir;
  process.env.LEXIFLOW_GENERATED_DIR = generatedDir;
  process.env.LEXIFLOW_RUNTIME_CWD = appDataDir;
  process.env.LEXIFLOW_ECDICT_DB = app.isPackaged
    ? path.join(process.resourcesPath, "ecdict.sqlite")
    : path.join(__dirname, "resources", "ecdict.sqlite");
  return { userData, appDataDir, generatedDir };
}

function createBrowserWindow() {
  const iconPath = path.join(__dirname, "public", "icon.png");
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f5f7fb",
    autoHideMenuBar: true,
    show: true,
    title: "LexiFlow · 英语词汇学习",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  win.setMenuBarVisibility(false);
  return win;
}

async function createWindow() {
  mainWindow = createBrowserWindow();
  await mainWindow.loadFile(path.join(__dirname, "public", "startup.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    backend = require("./server-entry");
    const started = await backend.startServer();
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(started.address)) {
        event.preventDefault();
        if (/^https:\/\//i.test(url)) shell.openExternal(url);
      }
    });
    await mainWindow.loadURL(started.address);
    mainWindow.setTitle("LexiFlow · 英语词汇学习");
    console.log(`LexiFlow desktop data: ${runtimePaths.appDataDir}`);
  } catch (err) {
    console.error("LexiFlow desktop startup failed:", err);
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f5f7fb;font-family:Segoe UI,Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh;color:#172033"><div style="text-align:center"><h2>LexiFlow</h2><p>应用没有正常启动，请关闭后重试。</p></div></body>`;
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(()=>{});
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

runtimePaths = configureRuntimePaths();
app.whenReady().then(createWindow).catch(err => {
  console.error("LexiFlow window startup failed:", err);
  app.quit();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(err => console.error("LexiFlow window restore failed:", err));
});
app.on("will-quit", () => { try { backend?.stopServer?.(); } catch {} });
