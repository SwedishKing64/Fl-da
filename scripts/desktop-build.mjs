// Build Flöda for the desktop app: the Next.js server as a standalone folder, on SQLite, with an
// empty database template beside it. `electron-builder` then wraps the result (see
// electron-builder.yml). Usage: `npm run desktop:build`, then `npm run desktop:dist`.
//
// What is baked in: the vendor the app checks its licence with (FLODA_LICENCE_SERVER, default
// https://fl-da.vercel.app) and the version from package.json. With FLODA_OPEN=1 the build is an
// open copy — no sign-in, no licence — and FLODA_ANTHROPIC_API_KEY, when set, goes in with it so
// the copy reads documents without a key being pasted. The key sits in floda.json inside the
// installed app, readable by whoever has the installer: give an open build a key of its own,
// with a spending limit, never the vendor's.
import { execSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const run = (cmd, env = {}) => {
  console.log(`[desktop-build] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
};

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// "none" builds a copy that checks no licence: its own account on the computer, the shop's own key.
const licenceServer = process.env.FLODA_LICENCE_SERVER === "none" ? "" : (process.env.FLODA_LICENCE_SERVER ?? "https://fl-da.vercel.app").replace(/\/+$/, "");
const open = process.env.FLODA_OPEN === "1";
const anthropicApiKey = open ? (process.env.FLODA_ANTHROPIC_API_KEY ?? "").trim() : "";
// An open copy has no licence to send pictures through, so it keeps them in Flöda's own picture
// store with a token of its own (the store's read-write token, as the website holds it).
const blobToken = open ? (process.env.FLODA_BLOB_TOKEN ?? "").trim() : "";

// 1. The schema stays on SQLite (the checked-in default). Make the empty template database.
const template = path.resolve("prisma/template.db");
rmSync(template, { force: true });
run("npx prisma generate");
run("npx prisma db push --skip-generate", { DATABASE_URL: "file:./template.db" });
if (!existsSync(template)) throw new Error("prisma db push did not create prisma/template.db");

// 2. The server, as a folder that runs on its own.
rmSync(".next", { recursive: true, force: true });
run("npx next build", { FLODA_DESKTOP_BUILD: "1" });
const standalone = path.resolve(".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("next build did not produce .next/standalone/server.js — is output: 'standalone' set?");

// Static assets and the public folder are not traced into standalone; the server expects them beside it.
cpSync(".next/static", path.join(standalone, ".next/static"), { recursive: true });
if (existsSync("public")) cpSync("public", path.join(standalone, "public"), { recursive: true });

// Next links a few bundled packages (sharp, Prisma's client) into place with symlinks. Inside a
// signed Mac bundle a symlink is a liability — codesign refuses one it cannot follow — so each is
// replaced by a real copy of what it pointed at, and a link to nothing is dropped.
const solid = solidify(standalone);
console.log(`[desktop-build] symlinks made solid: ${solid.copied} copied, ${solid.dropped} dropped`);

function solidify(dir) {
  const out = { copied: 0, dropped: 0 };
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      const target = path.resolve(dir, readlinkSync(p));
      unlinkSync(p);
      if (existsSync(target)) {
        if (statSync(target).isDirectory()) cpSync(target, p, { recursive: true, dereference: true });
        else cpSync(target, p, { dereference: true });
        out.copied++;
      } else {
        out.dropped++;
      }
    } else if (st.isDirectory()) {
      const inner = solidify(p);
      out.copied += inner.copied;
      out.dropped += inner.dropped;
    }
  }
  return out;
}

// 3. What the launcher reads.
mkdirSync("desktop", { recursive: true });
writeFileSync(
  "desktop/floda.json",
  JSON.stringify({ version: pkg.version, licenceServer, builtAt: new Date().toISOString(), ...(open ? { open: true } : {}), ...(anthropicApiKey ? { anthropicApiKey } : {}), ...(blobToken ? { blobToken } : {}) }, null, 2),
);
console.log(`[desktop-build] done: standalone at ${standalone}, template at ${template}, licence server ${licenceServer}${open ? `, open copy${anthropicApiKey ? ` with a key ending …${anthropicApiKey.slice(-4)}` : " without a key"}` : ""}`);
console.log("[desktop-build] check it under plain Node with: node desktop/launch.cjs --check");
