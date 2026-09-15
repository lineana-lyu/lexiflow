const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell, nativeImage, dialog } = require("electron");

app.setName("LexiFlow");
if (process.platform === "win32") app.setAppUserModelId("com.lexiflow.desktop");

const RELEASE_API_URL = "https://api.github.com/repos/lineana-lyu/lexiflow/releases/latest";
const RELEASE_PAGE_URL = "https://github.com/lineana-lyu/lexiflow/releases/latest";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let backend = null;
let runtimePaths = null;

function getAppIcon() {
  const candidates = [
    path.join(__dirname, "public", "icon.png"),
    path.join(__dirname, "build", "icon.ico"),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const image = nativeImage.createFromPath(candidate);
      if (!image.isEmpty()) return image;
    } catch {}
  }
  return undefined;
}

function normalizeVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0]
    .split("+")[0]
    .split(".")
    .map(part => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(latestVersion, currentVersion) {
  const latest = normalizeVersion(latestVersion);
  const current = normalizeVersion(currentVersion);
  const length = Math.max(latest.length, current.length, 3);
  for (let index = 0; index < length; index += 1) {
    const latestPart = latest[index] || 0;
    const currentPart = current[index] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}

function formatReleaseNotes(body) {
  const source = String(body || "").trim();
  if (!source) return "本次版本未提供更新说明，可打开下载页查看详情。";
  const plain = source
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plain.length > 3200 ? `${plain.slice(0, 3200).trim()}\n\n…更多内容请打开下载页查看。` : plain;
}

function getSafeReleaseUrl(value) {
  const url = String(value || "");
  return /^https:\/\/github\.com\/lineana-lyu\/lexiflow\/releases(?:\/|$)/i.test(url)
    ? url
    : RELEASE_PAGE_URL;
}

async function checkForUpdates() {
  if (!app.isPackaged || !mainWindow || mainWindow.isDestroyed()) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `LexiFlow/${app.getVersion()}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
    if (!response.ok) return;

    const release = await response.json();
    if (!release || release.draft || release.prerelease) return;

    const latestVersion = String(release.tag_name || release.name || "").trim();
    const currentVersion = app.getVersion();
    if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const notes = formatReleaseNotes(release.body);
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "LexiFlow · 发现新版本",
      message: `发现新版本 ${latestVersion}`,
      detail: `当前版本：v${currentVersion}\n\n本次更新：\n${notes}`,
      buttons: ["稍后提醒", "打开下载页"],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });

    if (result.response === 1) {
      await shell.openExternal(getSafeReleaseUrl(release.html_url));
    }
  } catch (err) {
    if (err?.name !== "AbortError") console.warn("LexiFlow update check failed:", err?.message || err);
  } finally {
    clearTimeout(timeout);
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

    const updateTimer = setTimeout(() => {
      checkForUpdates().catch(err => console.warn("LexiFlow update check failed:", err?.message || err));
    }, 1800);
    updateTimer.unref?.();
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
