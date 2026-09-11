const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell, nativeImage } = require("electron");

app.setName("LexiFlow");
if (process.platform === "win32") app.setAppUserModelId("com.lexiflow.desktop");

const APP_ICON_DATA_URL = "data:image/png;base64,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";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let backend = null;
let runtimePaths = null;

function getAppIcon() {
  try {
    const image = nativeImage.createFromDataURL(APP_ICON_DATA_URL);
    return image.isEmpty() ? undefined : image;
  } catch {
    return undefined;
  }
}

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
  return { userData, appDataDir, generatedDir };
}

function createBrowserWindow() {
  const appIcon = getAppIcon();
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#fafbf9",
    autoHideMenuBar: true,
    show: true,
    title: "LexiFlow · 英语词汇学习",
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  win.setMenuBarVisibility(false);
  if (appIcon && typeof win.setIcon === "function") win.setIcon(appIcon);
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
    backend = require("./server-runtime");
    const started = await backend.startServer();
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(started.address)) {
        event.preventDefault();
        if (/^https:\/\//i.test(url)) shell.openExternal(url);
      }
    });
    await mainWindow.loadURL(started.address);
    mainWindow.setTitle("LexiFlow · 英语词汇学习");
    const appIcon = getAppIcon();
    if (appIcon && typeof mainWindow.setIcon === "function") mainWindow.setIcon(appIcon);
    console.log(`LexiFlow desktop data: ${runtimePaths.appDataDir}`);
  } catch (err) {
    console.error("LexiFlow desktop startup failed:", err);
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fafbf9;font-family:Segoe UI,Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh;color:#172033"><div style="text-align:center"><h2>LexiFlow</h2><p>应用没有正常启动，请关闭后重试。</p></div></body>`;
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
