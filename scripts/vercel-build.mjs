// Vercel build. The checked-in Prisma schema targets SQLite for zero-setup local use.
//
//  - With a Postgres DATABASE_URL (Storage → Neon in the Vercel project): switch the datasource
//    provider to postgresql, regenerate the client, sync the schema, build.
//  - Without one: build against a SQLite template database that the app copies to /tmp at
//    runtime. The app works but data resets whenever the serverless instance restarts, and it
//    shows a banner saying so. This keeps a first deploy from failing before storage is added.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Keep in sync with src/lib/catalog/db-url.ts. Storage integrations disagree on the variable
// name (and a custom store prefix renames it again), so we match on the value, not the name.
const KEYS = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL_UNPOOLED", "NEON_DATABASE_URL", "PRISMA_DATABASE_URL"];
const ANY_PG = /^(prisma\+)?postgres(ql)?:\/\//i;
const PLAIN_PG = /^postgres(ql)?:\/\//i;

function findUrl() {
  for (const re of [PLAIN_PG, ANY_PG]) {
    for (const k of KEYS) if (process.env[k] && re.test(process.env[k])) return { url: process.env[k], key: k };
  }
  for (const k of KEYS) if (process.env[k]) return { url: process.env[k], key: k };
  const scanned = Object.keys(process.env).filter((k) => typeof process.env[k] === "string" && ANY_PG.test(process.env[k])).sort();
  const picked = scanned.find((k) => PLAIN_PG.test(process.env[k])) ?? scanned[0];
  if (picked) return { url: process.env[picked], key: picked };
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const auth = PGPASSWORD ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}` : encodeURIComponent(PGUSER);
    return { url: `postgresql://${auth}@${PGHOST}${PGPORT ? `:${PGPORT}` : ""}/${PGDATABASE}?sslmode=require`, key: "PGHOST + PGUSER + PGDATABASE" };
  }
  return undefined;
}

const found = findUrl();
const url = found?.url ?? "";
const schemaPath = "prisma/schema.prisma";

const dbShaped = Object.keys(process.env)
  .filter((k) => typeof process.env[k] === "string" && process.env[k] !== "" && (ANY_PG.test(process.env[k]) || /(^|_)(DATABASE|POSTGRES|NEON|PRISMA)_|^PG[A-Z]+$/.test(k)))
  .sort();
console.log(`[vercel-build] environment=${process.env.VERCEL_ENV ?? "?"} branch=${process.env.VERCEL_GIT_COMMIT_REF ?? "?"}`);
console.log(`[vercel-build] database-shaped variables: ${dbShaped.join(", ") || "none"}`);
console.log(`[vercel-build] using: ${found ? found.key : "none — falling back to an ephemeral SQLite template"}`);

if (/^(prisma\+)?postgres(ql)?:/i.test(url)) {
  const schema = readFileSync(schemaPath, "utf8").replace('provider = "sqlite"', 'provider = "postgresql"');
  writeFileSync(schemaPath, schema);
  process.env.DATABASE_URL = url;
  console.log("[vercel-build] Postgres database detected; Prisma provider switched to postgresql");
} else if (url) {
  console.log(`[vercel-build] Using DATABASE_URL as-is (${url.split(":")[0]}:...)`);
} else {
  process.env.DATABASE_URL = "file:./template.db"; // relative to prisma/schema.prisma => prisma/template.db
  console.warn("\n[vercel-build] WARNING: no DATABASE_URL. Building with an ephemeral SQLite database; add Storage → Neon (Postgres) to the Vercel project to keep data.\n");
}

const run = (cmd) => {
  console.log(`[vercel-build] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};
run("npx prisma generate");
run("npx prisma db push --skip-generate");
run("npx next build");
