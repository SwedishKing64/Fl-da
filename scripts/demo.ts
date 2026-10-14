// One-command local run: creates the SQLite database and starts the dev server. The app opens on
// its setup walk-through the first time. Usage: `npm run demo` then open http://localhost:3000
import { spawnSync, spawn } from "node:child_process";

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  STORAGE_DIR: process.env.STORAGE_DIR || "./storage",
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || "http://localhost:3000",
};
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args: string[]) {
  const r = spawnSync(npx, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n[demo] "${args.join(" ")}" failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

console.log("[demo] preparing database…");
run(["prisma", "generate"]);
run(["prisma", "db", "push", "--skip-generate"]);
console.log("\n[demo] starting dev server → http://localhost:3000\n");
const dev = spawn(npx, ["next", "dev", "-p", process.env.PORT || "3000"], { stdio: "inherit", env, shell: process.platform === "win32" });
dev.on("exit", (code) => process.exit(code ?? 0));
