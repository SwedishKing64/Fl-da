// How the desktop app runs Flöda: the built Next.js server, on this machine, against a SQLite
// database and a files folder in the user's own app-data directory.
//
// Plain CommonJS with no Electron in it, so the same launcher can be run under Node to check a
// build (`node desktop/launch.cjs --check`) and is what main.cjs uses inside the app.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

/** The standalone build, next to this file in a packaged app and under .next in a checkout. */
function standaloneDir(root) {
  for (const candidate of [path.join(root, "standalone"), path.join(root, ".next", "standalone"), path.join(root, "..", ".next", "standalone")]) {
    if (fs.existsSync(path.join(candidate, "server.js"))) return candidate;
  }
  throw new Error(`No standalone build found under ${root}. Run \`npm run desktop:build\` first.`);
}

/** A port nobody is on. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** First run: the empty database shipped with the app becomes the user's. */
function ensureDatabase(dataDir, templateDb) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = path.join(dataDir, "floda.db");
  if (!fs.existsSync(db)) {
    if (!templateDb || !fs.existsSync(templateDb)) throw new Error(`No database template at ${templateDb}`);
    fs.copyFileSync(templateDb, db);
  }
  return db;
}

async function waitFor(url, ms, child) {
  const until = Date.now() + ms;
  let last;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`The server stopped with code ${child.exitCode}${last ? ` (${last})` : ""}`);
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The server did not answer within ${ms / 1000}s${last ? ` (${last})` : ""}`);
}

/**
 * Start the server. Returns the URL to open and a function that stops it.
 *
 * @param {object} opts
 * @param {string} opts.root        where the build lives (the app's resources folder, or the repo)
 * @param {string} opts.dataDir     where the database and files go (Electron's userData)
 * @param {string} opts.execPath    the node to run it with (Electron itself, as node)
 * @param {string} [opts.templateDb]
 * @param {Record<string,string>} [opts.env]
 * @param {(line: string) => void} [opts.log]
 */
async function launch(opts) {
  const dir = standaloneDir(opts.root);
  const port = await freePort();
  const db = ensureDatabase(opts.dataDir, opts.templateDb ?? path.join(opts.root, "template.db"));
  const storage = path.join(opts.dataDir, "files");
  fs.mkdirSync(storage, { recursive: true });
  const url = `http://127.0.0.1:${port}`;
  const config = readConfig(opts.root);
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: `file:${db}`,
    STORAGE_DIR: storage,
    APP_PUBLIC_URL: url,
    FLODA_DESKTOP: "1",
    ...(config.licenceServer ? { FLODA_LICENCE_SERVER: config.licenceServer } : {}),
    ...(config.version ? { FLODA_VERSION: config.version } : {}),
    ...(opts.env ?? {}),
  };
  const log = opts.log ?? (() => {});
  const child = spawn(opts.execPath, [path.join(dir, "server.js")], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => log(String(d).trimEnd()));
  child.stderr.on("data", (d) => log(String(d).trimEnd()));
  await waitFor(`${url}/login`, 60_000, child);
  return {
    url,
    port,
    db,
    storage,
    child,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      child.kill();
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve(); }, 3000).unref();
    }),
  };
}

/** What the build baked in: the licence server and the version. Absent in a checkout. */
function readConfig(root) {
  for (const candidate of [path.join(root, "floda.json"), path.join(root, "desktop", "floda.json")]) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {}
  }
  return {};
}

module.exports = { launch, standaloneDir, freePort, ensureDatabase };

// `node desktop/launch.cjs --check [dataDir]`: start the build under plain Node, hit a page, stop.
if (require.main === module && process.argv.includes("--check")) {
  const root = path.resolve(__dirname, "..");
  const dataDir = process.argv[process.argv.indexOf("--check") + 1] || path.join(require("node:os").tmpdir(), "floda-check");
  launch({ root, dataDir, execPath: process.execPath, templateDb: path.join(root, "prisma", "template.db"), env: { ELECTRON_RUN_AS_NODE: "" }, log: (l) => console.log("[server]", l) })
    .then(async (s) => {
      console.log(`[check] up at ${s.url}, database ${s.db}`);
      for (const p of ["/login", "/setup", "/welcome"]) {
        const res = await fetch(`${s.url}${p}`, { redirect: "manual" });
        console.log(`[check] GET ${p} -> ${res.status}${res.headers.get("location") ? ` -> ${res.headers.get("location")}` : ""}`);
      }
      await s.stop();
      console.log("[check] stopped");
    })
    .catch((err) => { console.error("[check] FAILED:", err.message); process.exit(1); });
}
