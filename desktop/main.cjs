// Flöda as an app on a PC or a Mac.
//
// Electron opens a window; everything behind it is the same Next.js server the hosted Flöda
// runs, started here on a free port with a SQLite database and a files folder in the user's own
// app-data directory (see launch.cjs). Nothing leaves the machine except what the shop asks for:
// the reading service for PDFs and photos, brand pages for specs, and the vendor for the licence.

const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { launch, readConfig } = require("./launch.cjs");
const { keepCurrent } = require("./update.cjs");
const { readShops, writeShops, watchShops, shopDir, shopsFile } = require("./shops.cjs");

/** Where the build is: the app's resources folder once packaged, the repo while developing. */
function root() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
}

// What the build baked in. An open build (no sign-in, no licence, its own reading key) is a
// different app with its own data folder, so it can sit beside the ordinary one.
const config = readConfig(root());
const open = Boolean(config.open);

// The name in the app menu, in "About" and "Quit", and of the data folder in app-data — on every
// platform, whatever the bundle or the executable is called on disk (Floda, ASCII, so that the
// Mac bundle signs and Electron finds its helpers).
app.setName(open ? "Flöda Open" : "Flöda");

let server = null;
let win = null;
const lines = [];
const log = (line) => {
  lines.push(line);
  if (lines.length > 400) lines.shift();
  try { fs.appendFileSync(path.join(app.getPath("userData"), "floda.log"), `${new Date().toISOString()} ${line}\n`); } catch {}
};

/** The shop the server is running on, and whether it is between shops. */
let runningShop = null;
let switching = false;

async function start() {
  const dataRoot = app.getPath("userData");
  const shops = readShops(dataRoot);
  const dataDir = shopDir(dataRoot, shops.current);
  server = await launch({
    root: root(),
    dataDir,
    execPath: process.execPath,
    templateDb: app.isPackaged ? path.join(process.resourcesPath, "template.db") : path.join(root(), "prisma", "template.db"),
    // The app reads and writes the list of shops; this side watches it (see shops.cjs).
    env: { FLODA_VERSION: app.getVersion(), FLODA_SHOPS_FILE: shopsFile(dataRoot), FLODA_SHOP_ID: shops.current },
    log,
  });
  runningShop = shops.current;
  log(`[desktop] server at ${server.url}; shop ${shops.current}; data in ${dataDir}`);
}

/** The open shop's own folder: its database, files and backups. */
function currentDir() {
  return shopDir(app.getPath("userData"), runningShop ?? readShops(app.getPath("userData")).current);
}

/** Stop the server and start it again on the shop now chosen, and show its sign-in. */
async function switchShop() {
  if (switching) return;
  switching = true;
  try {
    while (readShops(app.getPath("userData")).current !== runningShop) {
      if (server) await server.stop();
      await start();
      if (win) void win.loadURL(`${server.url}${open ? "/open" : "/login"}`);
    }
  } catch (err) {
    log(`[desktop] could not open the other shop: ${err.message}`);
    dialog.showErrorBox("Flöda could not open that shop", `${err.message}\n\nThe last few lines of the log:\n${lines.slice(-12).join("\n")}`);
  } finally {
    switching = false;
    menu();
  }
}

/** Open another shop from the menu: written to the list, which the watch then acts on. */
function chooseShop(id) {
  const dataRoot = app.getPath("userData");
  const list = readShops(dataRoot);
  if (list.current === id) return;
  writeShops(dataRoot, { ...list, current: id });
  void switchShop();
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
  // An open copy signs its owner in at /open; the ordinary one starts at the login page.
  void win.loadURL(`${server.url}${open ? "/open" : "/login"}`);
  win.on("closed", () => { win = null; });
}

function menu() {
  const isMac = process.platform === "darwin";
  const shops = readShops(app.getPath("userData"));
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [{ label: "Open data folder", click: () => shell.openPath(currentDir()) }, { label: "Open backups folder", click: () => { const dir = path.join(currentDir(), "backups"); try { require("node:fs").mkdirSync(dir, { recursive: true }); } catch {} shell.openPath(dir); } }, { type: "separator" }, isMac ? { role: "close" } : { role: "quit" }] },
    { role: "editMenu" },
    { label: "Shop", submenu: [
      ...shops.shops.map((s) => ({ label: s.name, type: "radio", checked: s.id === shops.current, enabled: !switching, click: () => chooseShop(s.id) })),
      { type: "separator" },
      { label: "Add or rename shops…", enabled: Boolean(server) && !switching, click: () => { if (win && server) void win.loadURL(`${server.url}/settings#shops`); } },
    ] },
    { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
    { label: "Help", submenu: [{ label: "Flöda website", click: () => shell.openExternal("https://fl-da.vercel.app") }, { label: "Show the log", click: () => shell.openPath(path.join(app.getPath("userData"), "floda.log")) }, { type: "separator" }, { label: `Flöda ${app.getVersion()}${open ? " (open copy)" : ""}`, enabled: false }] },
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
      menu();
      // The app adds, renames and opens shops by writing the list; a change of shop restarts the server on it.
      watchShops(app.getPath("userData"), (list) => { menu(); if (list.current !== runningShop) void switchShop(); });
      // An open build is never updated over itself: the releases hold the ordinary app, and the
      // key and the open door would be lost with the swap.
      if (!open) keepCurrent({ log, window: () => win });
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
