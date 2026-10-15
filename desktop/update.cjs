// Keeping an installed copy current.
//
// A copy asks GitHub's releases of this repository for a newer version shortly after it starts
// and every few hours after that (electron-updater, reading the latest.yml electron-builder
// writes beside each installer). On Windows the new installer is downloaded in the background
// and the person is asked whether to restart now or later; the installer runs on quit either way.
// On a Mac an update can only be installed once the app is signed with an Apple Developer
// identity (Squirrel.Mac refuses an unsigned one), so until then the copy only says a newer
// version exists and opens the download page. Nothing is checked in development.

const { app, dialog, shell } = require("electron");

const RELEASES = "https://github.com/SwedishKing64/Fl-da/releases/latest";
const FIRST_CHECK_MS = 20_000;
const EVERY_MS = 4 * 3600 * 1000;

/**
 * @param {object} opts
 * @param {(line: string) => void} opts.log
 * @param {() => import("electron").BrowserWindow | null} opts.window  the window to ask in front of
 */
function keepCurrent({ log, window }) {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    log(`[update] electron-updater is not packaged: ${err.message}`);
    return;
  }
  const canInstall = process.platform === "win32";
  autoUpdater.logger = { info: (m) => log(`[update] ${m}`), warn: (m) => log(`[update] ${m}`), error: (m) => log(`[update] ${m}`), debug: () => {} };
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.allowPrerelease = false;

  let told = ""; // the version the person has already been asked about this session

  autoUpdater.on("update-available", (info) => {
    log(`[update] ${info.version} is available (this is ${app.getVersion()})`);
    if (canInstall || told === info.version) return;
    told = info.version;
    const ask = dialog.showMessageBox(window() ?? undefined, {
      type: "info",
      title: "A newer Flöda",
      message: `Flöda ${info.version} is out. This copy is ${app.getVersion()}.`,
      detail: "Download the new version and install it over this one; your data stays where it is.",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    void ask.then(({ response }) => { if (response === 0) void shell.openExternal(RELEASES); });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log(`[update] ${info.version} downloaded`);
    if (told === info.version) return;
    told = info.version;
    const ask = dialog.showMessageBox(window() ?? undefined, {
      type: "info",
      title: "Flöda is ready to update",
      message: `Flöda ${info.version} has been downloaded.`,
      detail: "Restart now to use it, or later and it is installed the next time Flöda is closed. Your data stays where it is.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    void ask.then(({ response }) => { if (response === 0) setImmediate(() => autoUpdater.quitAndInstall()); });
  });

  autoUpdater.on("error", (err) => log(`[update] ${err?.message ?? err}`));

  const check = () => autoUpdater.checkForUpdates().catch((err) => log(`[update] could not check: ${err?.message ?? err}`));
  setTimeout(check, FIRST_CHECK_MS).unref();
  setInterval(check, EVERY_MS).unref();
}

module.exports = { keepCurrent };
