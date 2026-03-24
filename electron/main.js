const {
  app,
  BrowserWindow,
  globalShortcut,
  desktopCapturer,
  screen,
  session,
  ipcMain,
  protocol,
  nativeImage,
  clipboard,
  dialog,
  Tray,
  Menu,
  Notification,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let editorWindow = null;
/** @type {BrowserWindow | null} */
let keepAliveWindow = null;
/** @type {BrowserWindow | null} */
let overlayWindow = null;
/** @type {BrowserWindow | null} */
let previewWindow = null;
/** @type {BrowserWindow | null} */
let flashWindow = null;
/** @type {BrowserWindow | null} */
let captureWindow = null;
/** @type {((dataUrl: string | null) => void) | null} */
let captureResolve = null;
/** @type {Electron.Tray | null} */
let tray = null;
/** last captured full-screen PNG as data-url (frozen frame for overlay) */
let frozenFrameDataUrl = null;
/** last cropped capture as data-url */
let lastCaptureDataUrl = null;
let lastCapturedImage = null;
let manualUpdateCheckRequested = false;
let isCheckingForUpdates = false;
let previewPinned = false;
let previewExpanded = false;
let previewEditMode = false;
let trayCreated = false;
let resolvedDevBaseUrl = process.env.ELECTRON_START_URL || null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  shortcut: "CommandOrControl+Shift+S",
  autoCopy: true,
  showPreview: true,
  defaultMode: "area", // "area" | "fullscreen"
};

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  const p = getSettingsPath();
  try {
    if (fs.existsSync(p)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(p, "utf8")) };
    }
  } catch (e) {
    console.warn("[settings] read failed:", e.message);
  }
  saveSettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s) {
  const p = getSettingsPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
  } catch (_) {
    /* ignore */
  }
}

// Register core clipboard IPC early so renderer can safely call it anytime.
try {
  ipcMain.removeHandler("clipboard:read-image");
} catch (_) {
  /* noop */
}
ipcMain.handle("clipboard:read-image", () => {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toDataURL();
  } catch (_) {
    return null;
  }
});

// ─── Screen capture helpers ───────────────────────────────────────────────────

function getPrimaryThumbnailSize(display) {
  const scale = display.scaleFactor || 1;
  const { width: dipW, height: dipH } = display.size;
  let pw = Math.max(2, Math.round(dipW * scale));
  let ph = Math.max(2, Math.round(dipH * scale));
  const maxDim = 8192;
  if (pw > maxDim || ph > maxDim) {
    const r = Math.min(maxDim / pw, maxDim / ph);
    pw = Math.max(2, Math.round(pw * r));
    ph = Math.max(2, Math.round(ph * r));
  }
  return { width: pw, height: ph, dipW, dipH, scale };
}

async function captureFullScreenNativeImage() {
  const display = screen.getPrimaryDisplay();
  const scaleFactor = display.scaleFactor || 1;
  const screenWidth = display.size.width;
  const screenHeight = display.size.height;
  const thumbnailSize = {
    width: Math.max(2, Math.round(screenWidth * scaleFactor)),
    height: Math.max(2, Math.round(screenHeight * scaleFactor)),
  };

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
  });

  if (!sources.length) {
    console.warn("[capture] getSources returned no screen sources");
    return null;
  }

  const primaryId = display.id;
  const primaryIdStr = String(primaryId);
  const source = sources.find(
    (s) =>
      s.display_id &&
      (s.display_id === primaryIdStr || Number(s.display_id) === primaryId)
  );
  if (!source) {
    console.warn(
      "[capture] primary display source not found",
      "primaryId=",
      primaryId,
      "available=",
      sources.map((s) => s.display_id || "(empty)")
    );
    return null;
  }

  if (source.thumbnail.isEmpty()) {
    console.warn("[capture] primary source thumbnail is empty");
    return null;
  }

  return source.thumbnail;
}

async function captureFullScreenDataUrl() {
  const img = await captureFullScreenNativeImage();
  if (!img) return null;
  const png = img.toPNG();
  if (!png?.length) return null;
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

function cropNativeImage(fullImg, rect, displayScale) {
  const s = displayScale || 1;
  const crop = {
    x: Math.round(rect.x * s),
    y: Math.round(rect.y * s),
    width: Math.round(rect.w * s),
    height: Math.round(rect.h * s),
  };
  return fullImg.crop(crop);
}

function nativeImageToDataUrl(img) {
  const png = img.toPNG();
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

function writeDataUrlToClipboard(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return;
  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(image);
  } catch (e) {
    console.warn("[capture] clipboard write failed:", e?.message || e);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Auto updates (GitHub Releases) ──────────────────────────────────────────

function notifyUpdate(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return;
    }
  } catch (_) {
    // Fallback below
  }
  void dialog.showMessageBox({
    type: "info",
    message: title,
    detail: body,
  });
}

async function checkForUpdatesManual() {
  if (!app.isPackaged) {
    notifyUpdate(
      "Updates unavailable in development",
      "Install a packaged build to check GitHub release updates."
    );
    return;
  }
  if (isCheckingForUpdates) {
    notifyUpdate("Already checking", "SnapClean is already checking for updates.");
    return;
  }
  manualUpdateCheckRequested = true;
  isCheckingForUpdates = true;
  console.log("[updater] manual check requested from tray");
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    isCheckingForUpdates = false;
    manualUpdateCheckRequested = false;
    console.error("[updater] manual check error:", err?.message || err);
    notifyUpdate("Update check failed", "Could not check for updates right now.");
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.log("[updater] development mode: skipping automatic update checks");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    isCheckingForUpdates = true;
    console.log("[updater] checking for updates");
  });

  autoUpdater.on("update-available", (info) => {
    isCheckingForUpdates = false;
    console.log("[updater] update available:", info?.version || "(unknown)");
    console.log("[updater] downloading update in background");
    if (manualUpdateCheckRequested) {
      notifyUpdate(
        "Update available",
        "A new version was found and is downloading in the background."
      );
      manualUpdateCheckRequested = false;
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    const speedMbps = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
    console.log(
      "[updater] downloading:",
      `${Math.round(progress.percent)}%`,
      `${Math.round(progress.transferred / 1024 / 1024)}MB`,
      "/",
      `${Math.round(progress.total / 1024 / 1024)}MB`,
      `@ ${speedMbps} MB/s`
    );
  });

  autoUpdater.on("update-not-available", () => {
    isCheckingForUpdates = false;
    console.log("[updater] no updates available");
    if (manualUpdateCheckRequested) {
      notifyUpdate(
        "You're up to date",
        "SnapClean is already running the latest version."
      );
      manualUpdateCheckRequested = false;
    }
  });

  autoUpdater.on("update-downloaded", async () => {
    isCheckingForUpdates = false;
    manualUpdateCheckRequested = false;
    console.log("[updater] update downloaded and ready");
    const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const result = await dialog.showMessageBox(targetWindow, {
      type: "info",
      buttons: ["Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: "Update available. Restart to install.",
      detail: "The latest SnapClean update has been downloaded.",
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (err) => {
    isCheckingForUpdates = false;
    console.error("[updater] error:", err?.message || err);
    if (manualUpdateCheckRequested) {
      notifyUpdate(
        "Update check failed",
        "SnapClean couldn't check for updates right now. Please try again."
      );
      manualUpdateCheckRequested = false;
    }
  });

  // Automatic check at app startup
  isCheckingForUpdates = true;
  void autoUpdater.checkForUpdates().catch((err) => {
    isCheckingForUpdates = false;
    console.error("[updater] startup check error:", err?.message || err);
  });
}

// ─── Hidden capture window (getDisplayMedia) ─────────────────────────────────

function createCaptureWindow() {
  captureWindow = new BrowserWindow({
    width: 1,
    height: 1,
    x: -100,
    y: -100,
    show: false,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "capture-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  captureWindow.loadFile(path.join(__dirname, "capture.html"));

  captureWindow.on("closed", () => {
    captureWindow = null;
  });
}

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const display = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1, height: 1 },
        });

        const primaryIdStr = String(display.id);
        const source =
          sources.find(
            (s) =>
              s.display_id &&
              (s.display_id === primaryIdStr ||
                Number(s.display_id) === display.id)
          ) || sources[0];

        if (source) {
          console.log("[displayMedia] auto-selecting source:", source.name);
          callback({ video: source });
        } else {
          console.warn("[displayMedia] no screen source found");
          callback({});
        }
      } catch (err) {
        console.error("[displayMedia] handler error:", err);
        callback({});
      }
    },
    { useSystemPicker: false }
  );
}

/**
 * Ask the hidden capture renderer to grab a pixel-perfect frame
 * via getDisplayMedia → video → canvas → PNG data URL.
 * Falls back to desktopCapturer thumbnail if it fails.
 */
async function captureScreenSharp() {
  if (!captureWindow || captureWindow.isDestroyed()) {
    createCaptureWindow();
    await new Promise((r) =>
      captureWindow.webContents.once("did-finish-load", r)
    );
  }

  return new Promise((resolve) => {
    captureResolve = resolve;

    const timeout = setTimeout(() => {
      console.warn("[capture:sharp] timed out, falling back to desktopCapturer");
      captureResolve = null;
      resolve(null);
    }, 5000);

    const cleanup = () => clearTimeout(timeout);

    const origResolve = resolve;
    captureResolve = (dataUrl) => {
      cleanup();
      origResolve(dataUrl);
    };

    console.log("[capture:sharp] requesting getDisplayMedia frame from renderer");
    captureWindow.webContents.send("capture:grab");
  });
}

/**
 * Capture a sharp full-screen image. Uses getDisplayMedia for native-res
 * output; falls back to desktopCapturer thumbnail if that path fails.
 */
async function captureSharpFullScreenDataUrl() {
  const sharp = await captureScreenSharp();
  if (sharp) {
    console.log("[capture:sharp] got pixel-perfect frame, length:", sharp.length);
    return sharp;
  }

  console.log("[capture:sharp] fallback to desktopCapturer thumbnail");
  return captureFullScreenDataUrl();
}

// ─── Overlay (selection) ──────────────────────────────────────────────────────

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    enableLargerThanScreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "overlay-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlayWindow.setFullScreenable(false);
  overlayWindow.setResizable(false);
  overlayWindow.setMovable(false);
  overlayWindow.setAlwaysOnTop(true, "screen-saver");

  if (process.platform === "darwin") {
    overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
  }

  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function showOverlay(frozenDataUrl, mode) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  // Force exact primary-display bounds and elevate above menu bar.
  overlayWindow.setBounds({ x, y, width, height });
  overlayWindow.setPosition(x, y);
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  overlayWindow.webContents.send("overlay:start", {
    frozenFrame: frozenDataUrl,
    mode: mode || "area",
    displayBounds: { x, y, width, height },
    scaleFactor: display.scaleFactor || 1,
  });

  overlayWindow.show();
  overlayWindow.focus();
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.hide();
}

async function prepareEditorForCapture() {
  if (editorWindow && !editorWindow.isDestroyed() && editorWindow.isVisible()) {
    editorWindow.hide();
  }
  await delay(200);
}

function restoreEditorAfterCapture() {
  // Intentionally no-op: editor should open only on explicit Edit action.
}

// ─── Preview (floating thumbnail) ────────────────────────────────────────────

const PREVIEW_COLLAPSED_W = 200;
const PREVIEW_COLLAPSED_H = 120;
const PREVIEW_EXPANDED_W = 350;
const PREVIEW_EXPANDED_H = 250;
const PREVIEW_EDITOR_W = 600;
const PREVIEW_EDITOR_H = 400;
const PREVIEW_MARGIN = 20;

function getPreviewBounds(mode = "collapsed") {
  const display = screen.getPrimaryDisplay();
  const { x, y, height } = display.workArea;
  const width =
    mode === "editor"
      ? PREVIEW_EDITOR_W
      : mode === "expanded"
        ? PREVIEW_EXPANDED_W
        : PREVIEW_COLLAPSED_W;
  const h =
    mode === "editor"
      ? PREVIEW_EDITOR_H
      : mode === "expanded"
        ? PREVIEW_EXPANDED_H
        : PREVIEW_COLLAPSED_H;
  return {
    x: x + PREVIEW_MARGIN,
    y: y + height - h - PREVIEW_MARGIN,
    width,
    height: h,
  };
}

function animatePreviewWindow(mode) {
  if (!previewWindow || previewWindow.isDestroyed()) return;
  const from = previewWindow.getBounds();
  const to = getPreviewBounds(mode);
  const start = Date.now();
  const duration = mode === "editor" ? 280 : 240;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const tick = () => {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    const elapsed = Date.now() - start;
    const t = Math.min(1, elapsed / duration);
    const e = easeOut(t);
    previewWindow.setBounds({
      x: Math.round(from.x + (to.x - from.x) * e),
      y: Math.round(from.y + (to.y - from.y) * e),
      width: Math.round(from.width + (to.width - from.width) * e),
      height: Math.round(from.height + (to.height - from.height) * e),
    });
    if (t < 1) {
      setTimeout(tick, 16);
    }
  };
  tick();
}

function createPreviewWindow() {
  const b = getPreviewBounds("collapsed");

  previewWindow = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preview-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  previewWindow.setAlwaysOnTop(true, "screen-saver");

  if (process.platform === "darwin") {
    previewWindow.setVisibleOnAllWorkspaces(true);
  }

  previewWindow.loadFile(path.join(__dirname, "preview.html"));

  previewWindow.on("closed", () => {
    previewWindow = null;
    previewExpanded = false;
    previewPinned = false;
  });
}

function showPreview(dataUrl) {
  if (!previewWindow || previewWindow.isDestroyed()) {
    createPreviewWindow();
  }
  previewExpanded = false;
  previewPinned = false;
  previewEditMode = false;
  previewWindow.setBounds(getPreviewBounds("collapsed"));
  const sendShow = () => {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    previewWindow.webContents.send("preview:show", { dataUrl });
    previewWindow.showInactive();
  };
  if (previewWindow.webContents.isLoadingMainFrame()) {
    previewWindow.webContents.once("did-finish-load", sendShow);
  } else {
    sendShow();
  }
}

function hidePreview() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.hide();
  }
}

// ─── Capture flash effect ─────────────────────────────────────────────────────

function createFlashWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  flashWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  flashWindow.setIgnoreMouseEvents(true);
  if (process.platform === "darwin") {
    flashWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    flashWindow.setAlwaysOnTop(true, "screen-saver");
  }
  flashWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        "<!doctype html><html><body style='margin:0;background:#fff;width:100vw;height:100vh;'></body></html>"
      )
  );
  flashWindow.on("closed", () => {
    flashWindow = null;
  });
}

function triggerCaptureFlash() {
  if (!flashWindow || flashWindow.isDestroyed()) {
    createFlashWindow();
  }
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  flashWindow.setBounds({ x, y, width, height });
  flashWindow.setOpacity(0);
  flashWindow.showInactive();
  setTimeout(() => {
    if (!flashWindow || flashWindow.isDestroyed()) return;
    flashWindow.setOpacity(0.3);
    setTimeout(() => {
      if (!flashWindow || flashWindow.isDestroyed()) return;
      flashWindow.setOpacity(0);
      setTimeout(() => {
        if (!flashWindow || flashWindow.isDestroyed()) return;
        flashWindow.hide();
      }, 40);
    }, 45);
  }, 0);
}

// ─── Main editor window ──────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 12 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const isDev = !app.isPackaged;
  const editorUrl = isDev ? getEditorRouteUrl() : "app://-/editor.html";

  if (isDev) {
    loadDevRouteWithFallback(mainWindow, "/editor");
  } else {
    mainWindow.loadURL(editorUrl).catch((err) => {
      console.error("[mainWindow] failed loading packaged editor:", err);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createKeepAliveWindow() {
  if (keepAliveWindow && !keepAliveWindow.isDestroyed()) return;
  keepAliveWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    skipTaskbar: true,
    webPreferences: {
      backgroundThrottling: false,
    },
  });

  keepAliveWindow.loadURL("about:blank").catch(() => {
    /* */
  });

  keepAliveWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
    }
  });
}

function showMainWindowWithScreenshot(dataUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }

  if (dataUrl) writeDataUrlToClipboard(dataUrl);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function getEditorRouteUrl() {
  const isDev = !app.isPackaged;
  if (!isDev) return "app://-/editor.html";
  return `${resolvedDevBaseUrl || process.env.ELECTRON_START_URL || "http://localhost:3000"}/editor`;
}

function getDevBaseCandidates() {
  if (resolvedDevBaseUrl) return [resolvedDevBaseUrl];
  if (process.env.ELECTRON_START_URL) return [process.env.ELECTRON_START_URL];
  return ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];
}

function loadDevRouteWithFallback(win, route) {
  const bases = getDevBaseCandidates();
  let index = 0;
  const tryLoad = () => {
    if (!win || win.isDestroyed()) return;
    const base = bases[index];
    const url = `${base}${route}`;
    win
      .loadURL(url)
      .then(() => {
        resolvedDevBaseUrl = base;
      })
      .catch(() => {
        index = (index + 1) % bases.length;
        setTimeout(tryLoad, 700);
      });
  };
  tryLoad();
}

function createEditorWindow() {
  if (editorWindow && !editorWindow.isDestroyed()) return editorWindow;
  editorWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#0f0f0f",
    title: "",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 12 },
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  editorWindow.center();

  const editorUrl = getEditorRouteUrl();
  if (!app.isPackaged) {
    loadDevRouteWithFallback(editorWindow, "/editor");
  } else {
    editorWindow.loadURL(editorUrl).catch((err) => {
      console.error("[editorWindow] failed loading packaged editor:", err);
    });
  }

  editorWindow.on("closed", () => {
    editorWindow = null;
  });
  return editorWindow;
}

function showEditorWindowAnimated() {
  const win = createEditorWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    win.focus();
    return;
  }
  win.setOpacity(0);
  win.show();
  win.focus();
  let o = 0;
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    o += 0.2;
    win.setOpacity(Math.min(1, o));
    if (o >= 1) clearInterval(timer);
  }, 20);
}

function openEditor() {
  if (!editorWindow || editorWindow.isDestroyed()) {
    createEditorWindow();
  }
  if (!editorWindow || editorWindow.isDestroyed()) return;

  const notifyClipboardUpdated = () => {
    if (!editorWindow || editorWindow.isDestroyed()) return;
    editorWindow.webContents.send("editor:clipboard-updated");
  };

  const showNow = () => {
    if (!editorWindow || editorWindow.isDestroyed()) return;
    editorWindow.show();
    editorWindow.focus();
  };

  if (editorWindow.isVisible()) {
    editorWindow.focus();
    notifyClipboardUpdated();
    return;
  }

  if (!editorWindow.webContents.isLoadingMainFrame()) {
    showNow();
    setTimeout(notifyClipboardUpdated, 50);
    return;
  }

  editorWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      showNow();
      notifyClipboardUpdated();
    }, 200);
  });
}

// ─── Core capture flow ───────────────────────────────────────────────────────

async function startCaptureFlow() {
  const settings = loadSettings();
  console.log("[capture] starting flow, mode:", settings.defaultMode);

  if (settings.defaultMode === "fullscreen") {
    await doFullscreenCapture(settings);
    return;
  }

  // Area mode: freeze screen, show overlay
  await prepareEditorForCapture();
  const frozenImg = await captureFullScreenNativeImage();
  if (!frozenImg) {
    console.warn("[capture] failed to grab frozen frame");
    restoreEditorAfterCapture();
    return;
  }
  frozenFrameDataUrl = nativeImageToDataUrl(frozenImg);
  showOverlay(frozenFrameDataUrl, "area");
}

async function doFullscreenCapture(settings) {
  await prepareEditorForCapture();
  hideOverlay();
  await delay(150);

  const dataUrl = await captureSharpFullScreenDataUrl();
  if (!dataUrl) {
    restoreEditorAfterCapture();
    return;
  }
  lastCaptureDataUrl = dataUrl;
  lastCapturedImage = dataUrl;
  finishCapture(dataUrl, settings);
}

function finishCapture(dataUrl, settings) {
  lastCaptureDataUrl = dataUrl;
  lastCapturedImage = dataUrl;
  writeDataUrlToClipboard(dataUrl);
  if (!settings) settings = loadSettings();
  restoreEditorAfterCapture();
  triggerCaptureFlash();

  if (settings.autoCopy) {
    try {
      const ni = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(ni);
      console.log("[capture] copied to clipboard");
    } catch (e) {
      console.warn("[capture] clipboard copy failed:", e.message);
    }
  }

  showPreview(dataUrl);
}

async function captureSelectedAreaDataUrl(rect) {
  const width = rect?.w ?? rect?.width;
  const height = rect?.h ?? rect?.height;
  if (!rect || width <= 1 || height <= 1) return null;
  const dataUrl = await captureSharpFullScreenDataUrl();
  if (!dataUrl) return null;

  const display = screen.getPrimaryDisplay();
  const fullImg = nativeImage.createFromDataURL(dataUrl);
  const imgSize = fullImg.getSize();
  const captureScale = imgSize.width / display.size.width;

  const cropped = fullImg.crop({
    x: Math.round((rect.x ?? 0) * captureScale),
    y: Math.round((rect.y ?? 0) * captureScale),
    width: Math.round(width * captureScale),
    height: Math.round(height * captureScale),
  });
  return nativeImageToDataUrl(cropped);
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

function setupIPC() {
  // Capture renderer → main: getDisplayMedia result
  ipcMain.on("capture:result", (_e, dataUrl) => {
    if (captureResolve) {
      const cb = captureResolve;
      captureResolve = null;
      cb(dataUrl);
    }
  });

  // Overlay → main: user finished area selection
  ipcMain.on("overlay:capture-area", async (_e, rect) => {
    hideOverlay();
    console.log("[capture] overlay hidden; waiting before sharp capture");

    if (!rect || rect.w <= 1 || rect.h <= 1) return;

    const settings = loadSettings();
    await delay(150);
    console.log("[capture] starting fresh getDisplayMedia capture");
    const croppedUrl = await captureSelectedAreaDataUrl(rect);
    if (!croppedUrl) {
      console.warn("[capture] all capture paths failed");
      restoreEditorAfterCapture();
      return;
    }
    lastCaptureDataUrl = croppedUrl;
    lastCapturedImage = croppedUrl;
    console.log("[capture] area cropped:", rect.w, "x", rect.h);

    finishCapture(croppedUrl, settings);
  });

  ipcMain.on("overlay:capture-area-action", async (_e, payload) => {
    console.log("MAIN RECEIVED:", payload);
    const rect = payload?.rect;
    const action = payload?.action;
    hideOverlay();
    const width = rect?.w ?? rect?.width;
    const height = rect?.h ?? rect?.height;
    if (!rect || width <= 1 || height <= 1) return;

    await delay(150);
    const croppedUrl = await captureSelectedAreaDataUrl(rect);
    if (!croppedUrl) {
      restoreEditorAfterCapture();
      return;
    }
    lastCaptureDataUrl = croppedUrl;
    lastCapturedImage = croppedUrl;
    restoreEditorAfterCapture();
    triggerCaptureFlash();

    if (action === "copy") {
      try {
        clipboard.writeImage(nativeImage.createFromDataURL(croppedUrl));
      } catch (_) {
        /* */
      }
      showPreview(croppedUrl);
      return;
    }

    if (action === "save") {
      const result = await dialog.showSaveDialog({
        defaultPath: `cleanshot-${Date.now()}.png`,
        filters: [{ name: "Images", extensions: ["png"] }],
      });
      if (!result.canceled && result.filePath) {
        const base64 = croppedUrl.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
      }
      showPreview(croppedUrl);
      return;
    }

    if (action === "edit") {
      writeDataUrlToClipboard(croppedUrl);
      openEditor();
      return;
    }

    if (action === "pin") {
      showPreview(croppedUrl);
      previewPinned = true;
      if (previewWindow && !previewWindow.isDestroyed()) {
        previewWindow.webContents.send("preview:force-pin", true);
      }
      return;
    }

    finishCapture(croppedUrl, loadSettings());
  });

  ipcMain.on("overlay:capture-fullscreen", async () => {
    hideOverlay();
    console.log("[capture] overlay hidden; waiting before sharp fullscreen capture");
    await delay(150);
    console.log("[capture] starting fresh getDisplayMedia fullscreen capture");

    const dataUrl = await captureSharpFullScreenDataUrl();
    if (!dataUrl) {
      console.warn("[capture] all capture paths failed");
      restoreEditorAfterCapture();
      return;
    }

    lastCaptureDataUrl = dataUrl;
    lastCapturedImage = dataUrl;
    console.log("[capture] fullscreen captured (sharp)");
    finishCapture(dataUrl, loadSettings());
  });

  ipcMain.on("overlay:cancel", () => {
    hideOverlay();
  });

  // Preview actions
  ipcMain.on("preview:edit", () => {
    console.log("MAIN RECEIVED EDIT");
    if (!lastCapturedImage) {
      console.log("NO IMAGE");
      return;
    }
    hidePreview();
    writeDataUrlToClipboard(lastCapturedImage);
    openEditor();
  });

  ipcMain.on("preview:copy", () => {
    if (lastCaptureDataUrl) {
      try {
        const ni = nativeImage.createFromDataURL(lastCaptureDataUrl);
        clipboard.writeImage(ni);
      } catch (_) {
        /* */
      }
    }
  });

  ipcMain.on("preview:expand", () => {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    if (previewEditMode) return;
    if (previewExpanded) return;
    previewExpanded = true;
    animatePreviewWindow("expanded");
  });

  ipcMain.on("preview:collapse", () => {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    if (previewEditMode) return;
    if (previewPinned) return;
    if (!previewExpanded) return;
    previewExpanded = false;
    animatePreviewWindow("collapsed");
  });

  ipcMain.on("preview:pin", (_e, pinned) => {
    previewPinned = Boolean(pinned);
    console.log("[preview] pin:", previewPinned);
  });

  ipcMain.on("preview:save", async () => {
    if (!lastCaptureDataUrl) return;
    const result = await dialog.showSaveDialog({
      defaultPath: `cleanshot-${Date.now()}.png`,
      filters: [{ name: "Images", extensions: ["png"] }],
    });
    if (!result.canceled && result.filePath) {
      const base64 = lastCaptureDataUrl.replace(
        /^data:image\/png;base64,/,
        ""
      );
      fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
    }
  });

  ipcMain.on("preview:update-data", (_e, dataUrl) => {
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
      lastCaptureDataUrl = dataUrl;
      lastCapturedImage = dataUrl;
    }
  });

  ipcMain.on("preview:edit-mode", (_e, enabled) => {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    previewEditMode = Boolean(enabled);
    if (previewEditMode) {
      previewExpanded = true;
      animatePreviewWindow("editor");
    } else {
      previewExpanded = false;
      animatePreviewWindow("collapsed");
    }
  });

  ipcMain.on("preview:close", () => {
    hidePreview();
    previewPinned = false;
    previewExpanded = false;
    previewEditMode = false;
  });

  // Settings IPC (for the Next.js settings page)
  ipcMain.handle("settings:load", () => loadSettings());

  ipcMain.handle("settings:save", (_e, newSettings) => {
    const merged = { ...DEFAULT_SETTINGS, ...newSettings };
    saveSettings(merged);
    registerShortcutFromSettings();
    return merged;
  });

  ipcMain.handle("settings:path", () => getSettingsPath());

  ipcMain.handle("editor:set-pinned", (_e, pinned) => {
    if (!editorWindow || editorWindow.isDestroyed()) return false;
    const pin = Boolean(pinned);
    editorWindow.setAlwaysOnTop(pin, pin ? "floating" : "normal");
    return pin;
  });
}

// ─── Global shortcut ─────────────────────────────────────────────────────────

function registerShortcutFromSettings() {
  globalShortcut.unregisterAll();
  const settings = loadSettings();
  const accel = settings.shortcut || DEFAULT_SETTINGS.shortcut;

  const ok = globalShortcut.register(accel, () => {
    void startCaptureFlow();
  });

  if (!ok) {
    console.warn(`[shortcut] failed to register: ${accel}`);
  } else {
    console.log(`[shortcut] registered: ${accel}`);
  }
}

// ─── Tray (menu-bar mode) ────────────────────────────────────────────────────

function createTray() {
  if (trayCreated && tray && !tray.isDestroyed()) return;
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "..", "build", "trayTemplate.png")
  );
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("SnapClean");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Capture Area",
      click: () => void startCaptureFlow(),
    },
    {
      label: "Capture Fullscreen",
      click: () => void doFullscreenCapture(loadSettings()),
    },
    { type: "separator" },
    {
      label: "Open Editor",
      click: () => {
        const win = createEditorWindow();
        if (win.webContents.isLoading()) {
          win.webContents.once("did-finish-load", () => showEditorWindowAnimated());
        } else {
          showEditorWindowAnimated();
        }
      },
    },
    {
      label: "Settings",
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
        const isDev = !app.isPackaged;
        const settingsUrl = isDev
          ? `${resolvedDevBaseUrl || process.env.ELECTRON_START_URL || "http://localhost:3000"}/settings`
          : "app://-/settings.html";
        mainWindow.loadURL(settingsUrl).catch(() => {
          /* */
        });
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Check for Updates",
      click: () => {
        void checkForUpdatesManual();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => tray?.popUpContextMenu());
  trayCreated = true;
  console.log("Tray created:", !!tray);
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Remove default Electron menu bar — prevents it from appearing on any window
  Menu.setApplicationMenu(null);

  if (app.isPackaged) {
    const outDir = path.join(__dirname, "..", "out");
    protocol.handle("app", async (request) => {
      try {
        const url = new URL(request.url);
        let pathname = decodeURIComponent(url.pathname || "/");
        if (pathname === "/") pathname = "/index.html";

        let filePath = path.join(outDir, pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, "index.html");
        }

        if (!fs.existsSync(filePath)) {
          // Support exported routes like /settings -> settings.html
          const flatHtml = path.join(outDir, pathname.replace(/\/$/, "") + ".html");
          if (fs.existsSync(flatHtml)) {
            filePath = flatHtml;
          } else {
            filePath = path.join(outDir, "index.html");
          }
        }

        return new Response(fs.readFileSync(filePath));
      } catch (err) {
        console.error("[protocol] app:// handler error:", err);
        return new Response("Not found", { status: 404 });
      }
    });
  }

  setupDisplayMediaHandler();
  setupAutoUpdater();
  setupIPC();
  createMainWindow();
  createOverlayWindow();
  createPreviewWindow();
  createCaptureWindow();
  if (process.platform === "darwin") {
    createTray();
  }
  registerShortcutFromSettings();
  showEditorWindowAnimated();

  app.on("activate", () => {
    const win = createEditorWindow();
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => showEditorWindowAnimated());
    } else {
      showEditorWindowAnimated();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Standard desktop app behavior: quit when all windows close.
  app.quit();
});

app.on("before-quit", () => {
  app.isQuiting = true;
});
