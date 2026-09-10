const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

app.setName("LexiFlow");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

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

  return { userData, appDataDir, generatedDir };
}

async function createWindow() {
  backend = require("./server");
  const started = await backend.startServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f4f6fa",
    autoHideMenuBar: true,
    show: false,
    title: "LexiFlow",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(started.address)) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(started.address);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  console.log(`LexiFlow desktop data: ${runtimePaths.appDataDir}`);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

runtimePaths = configureRuntimePaths();

app.whenReady().then(createWindow).catch(err => {
  console.error("LexiFlow desktop startup failed:", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(err => console.error("LexiFlow window restore failed:", err));
  }
});

app.on("will-quit", () => {
  try {
    backend?.stopServer?.();
  } catch {}
});
