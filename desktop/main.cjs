// Flöda as an app on a PC or a Mac.
//
// Electron opens a window; everything behind it is the same Next.js server the hosted Flöda
// runs, started here on a free port with a SQLite database and a files folder in the user's own
// app-data directory (see launch.cjs). Nothing leaves the machine except what the shop asks for:
// the reading service for PDFs and photos, brand pages for specs, and the vendor for the licence.

const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { launch } = require("./launch.cjs");
const { keepCurrent } = require("./update.cjs");

// The name in the app menu, in "About" and "Quit", and of the data folder in app-data — on every
// platform, whatever the bundle or the executable is called on disk (Floda, ASCII, so that the
// Mac bundle signs and Electron finds its helpers).
app.setName("Flöda");

let server = null;
let win = null;
const lines = [];
const log = (line) => {
  lines.push(line);
  if (lines.length > 400) lines.shift();
  try { fs.appendFileSync(path.join(app.getPath("userData"), "floda.log"), `${new Date().toISOString()} ${line}\n`); } catch {}
};

/** Where the build is: the app's resources folder once packaged, the repo while developing. */
function root() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
}

async function start() {
  const dataDir = app.getPath("userData");
  server = await launch({
    root: root(),
    dataDir,
    execPath: process.execPath,
    templateDb: app.isPackaged ? path.join(process.resourcesPath, "template.db") : path.join(root(), "prisma", "template.db"),
    env: { FLODA_VERSION: app.getVersion() },
    log,
  });
  log(`[desktop] server at ${server.url}; data in ${dataDir}`);
}

function openWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Flöda",
    backgroundColor: "#f0f2f5",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Links to the outside — a brand's page, Shopify, Anthropic's console — open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(server.url)) { void shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(server.url)) { event.preventDefault(); void shell.openExternal(url); }
  });
  // Downloads (the CSVs) go to the Downloads folder without a dialog each time.
  win.webContents.session.on("will-download", (_e, item) => {
    item.setSavePath(path.join(app.getPath("downloads"), item.getFilename()));
  });
  void win.loadURL(`${server.url}/login`);
  win.on("closed", () => { win = null; });
}

function menu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [{ label: "Open data folder", click: () => shell.openPath(app.getPath("userData")) }, { type: "separator" }, isMac ? { role: "close" } : { role: "quit" }] },
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
    { label: "Help", submenu: [{ label: "Flöda website", click: () => shell.openExternal("https://floda.ai") }, { label: "Show the log", click: () => shell.openPath(path.join(app.getPath("userData"), "floda.log")) }, { type: "separator" }, { label: `Flöda ${app.getVersion()}`, enabled: false }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One copy at a time: a second launch focuses the first window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(async () => {
    menu();
    try {
      await start();
      openWindow();
      keepCurrent({ log, window: () => win });
    } catch (err) {
      log(`[desktop] could not start: ${err.message}`);
      dialog.showErrorBox("Flöda could not start", `${err.message}\n\nThe last few lines of the log:\n${lines.slice(-12).join("\n")}`);
      app.quit();
    }
  });

  app.on("activate", () => { if (server && BrowserWindow.getAllWindows().length === 0) openWindow(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => { if (server) void server.stop(); });
}
