// The shops kept on this computer, and which one is open.
//
// One install can hold several shops (asked 2026-10-27): an owner with two stores, or somebody
// who looks after a few. Each shop is a database and a files folder of its own, so nothing one
// shop learns, builds or keeps is ever seen by another. The first shop is the app-data folder
// itself, exactly as it always was; every shop added after it gets a folder under `shops/`.
//
// The list is a small JSON file in app-data, `shops.json`. The app writes it (Settings → Shops
// on this computer: add, rename, open) and this side watches it: when the open shop changes, the
// server is stopped and started again on the other shop's folder. Plain CommonJS with no Electron
// in it, so it can be tested under Node.

const fs = require("node:fs");
const path = require("node:path");

const FILE = "shops.json";
const FIRST = "main";

/** The list's path in an app-data folder. */
function shopsFile(dataRoot) {
  return path.join(dataRoot, FILE);
}

/** A folder for a shop: the app-data folder for the first, `shops/<id>` for the rest. */
function shopDir(dataRoot, id) {
  return id === FIRST ? dataRoot : path.join(dataRoot, "shops", id);
}

/** The list as it is on disk, made whole: always at least the first shop, and a known one open. */
function readShops(dataRoot) {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(shopsFile(dataRoot), "utf8"));
  } catch {}
  const shops = (Array.isArray(stored.shops) ? stored.shops : [])
    .filter((s) => s && typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id))
    .map((s) => ({ id: s.id, name: String(s.name || "").trim().slice(0, 80) || "Shop" }));
  if (!shops.some((s) => s.id === FIRST)) shops.unshift({ id: FIRST, name: "My shop" });
  const current = shops.some((s) => s.id === stored.current) ? stored.current : FIRST;
  return { current, shops };
}

/** Write the list; made whole first. */
function writeShops(dataRoot, list) {
  fs.mkdirSync(dataRoot, { recursive: true });
  const tmp = `${shopsFile(dataRoot)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, shopsFile(dataRoot));
}

/**
 * Call `onChange(list)` whenever the open shop or the names change. Polled, since a watch on one
 * file is unreliable across platforms and editors that replace it. Returns a function that stops.
 */
function watchShops(dataRoot, onChange, intervalMs = 700) {
  let last = JSON.stringify(readShops(dataRoot));
  const file = shopsFile(dataRoot);
  const check = () => {
    const now = readShops(dataRoot);
    const text = JSON.stringify(now);
    if (text !== last) {
      last = text;
      onChange(now);
    }
  };
  fs.watchFile(file, { interval: intervalMs }, check);
  return () => fs.unwatchFile(file, check);
}

module.exports = { FIRST, shopsFile, shopDir, readShops, writeShops, watchShops };
