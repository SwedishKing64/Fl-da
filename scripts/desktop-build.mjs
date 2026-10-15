// Build Flöda for the desktop app: the Next.js server as a standalone folder, on SQLite, with an
// empty database template beside it. `electron-builder` then wraps the result (see
// electron-builder.yml). Usage: `npm run desktop:build`, then `npm run desktop:dist`.
//
// What is baked in: the vendor the app checks its licence with (FLODA_LICENCE_SERVER, default
// https://fl-da.vercel.app) and the version from package.json.
import { execSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const run = (cmd, env = {}) => {
  console.log(`[desktop-build] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
};

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const licenceServer = (process.env.FLODA_LICENCE_SERVER ?? "https://fl-da.vercel.app").replace(/\/+$/, "");

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
writeFileSync("desktop/floda.json", JSON.stringify({ version: pkg.version, licenceServer, builtAt: new Date().toISOString() }, null, 2));
console.log(`[desktop-build] done: standalone at ${standalone}, template at ${template}, licence server ${licenceServer}`);
console.log("[desktop-build] check it under plain Node with: node desktop/launch.cjs --check");
