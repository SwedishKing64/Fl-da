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
const PG = /^postgres(ql)?:\/\//i;
const ACCELERATE = /^prisma\+postgres(ql)?:\/\//i;
const FILE = /^file:/i;
const ANY_PG = PG; // reported shape; Accelerate is tracked separately below

function findUrl() {
  for (const re of [PG, FILE]) {
    for (const k of KEYS) if (process.env[k] && re.test(process.env[k])) return { url: process.env[k], key: k };
  }
  const scanned = Object.keys(process.env).filter((k) => typeof process.env[k] === "string" && PG.test(process.env[k])).sort()[0];
  if (scanned) return { url: process.env[scanned], key: scanned };
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const auth = PGPASSWORD ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}` : encodeURIComponent(PGUSER);
    return { url: `postgresql://${auth}@${PGHOST}${PGPORT ? `:${PGPORT}` : ""}/${PGDATABASE}?sslmode=require`, key: "PGHOST + PGUSER + PGDATABASE" };
  }
  return undefined;
}

/** Prisma's schema engine needs a direct connection; Neon's pooled host breaks `db push`. */
function directUrl(url) {
  for (const k of ["POSTGRES_URL_NON_POOLING", "DATABASE_URL_UNPOOLED"]) {
    if (process.env[k] && PG.test(process.env[k])) return process.env[k];
  }
  if (!PG.test(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.replace("-pooler.", ".");
    parsed.searchParams.delete("pgbouncer");
    parsed.searchParams.delete("connection_limit");
    return parsed.toString();
  } catch {
    return url;
  }
}

const accelerateName = Object.keys(process.env)
  .filter((k) => typeof process.env[k] === "string" && ACCELERATE.test(process.env[k]))
  .sort()[0];
const found = findUrl();
const url = found?.url ?? "";
const schemaPath = "prisma/schema.prisma";

const dbShaped = Object.keys(process.env)
  .filter((k) => typeof process.env[k] === "string" && process.env[k] !== "" && (ANY_PG.test(process.env[k]) || ACCELERATE.test(process.env[k]) || /(^|_)(DATABASE|POSTGRES|NEON|PRISMA)_|^PG[A-Z]+$/.test(k)))
  .sort();
console.log(`[vercel-build] environment=${process.env.VERCEL_ENV ?? "?"} branch=${process.env.VERCEL_GIT_COMMIT_REF ?? "?"}`);
console.log(`[vercel-build] database-shaped variables: ${dbShaped.join(", ") || "none"}`);
console.log(`[vercel-build] using: ${found ? found.key : "none — falling back to an ephemeral SQLite template"}`);
if (accelerateName && !found) {
  console.warn(`\n[vercel-build] WARNING: ${accelerateName} holds a Prisma Accelerate URL (prisma+postgres://). This app talks to Postgres directly, so that URL cannot be used. Add a store that exposes a plain postgres:// connection string, or set DATABASE_URL to your database's direct URL.\n`);
}

const run = (cmd, env = process.env) => {
  console.log(`[vercel-build] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
};

const originalSchema = readFileSync(schemaPath, "utf8");

/** Point Prisma at the database and create the tables. Everything here is best effort. */
function prepareDatabase() {
  if (PG.test(url)) {
    writeFileSync(schemaPath, originalSchema.replace('provider = "sqlite"', 'provider = "postgresql"'));
    process.env.DATABASE_URL = url;
    console.log("[vercel-build] Postgres database detected; Prisma provider switched to postgresql");
  } else if (url) {
    console.log(`[vercel-build] Using DATABASE_URL as-is (${url.split(":")[0]}:...)`);
  } else {
    process.env.DATABASE_URL = "file:./template.db"; // relative to prisma/schema.prisma => prisma/template.db
    console.warn("\n[vercel-build] WARNING: no DATABASE_URL. Building with an ephemeral SQLite database; add Storage → Neon (Postgres) to the Vercel project to keep data.\n");
  }

  run("npx prisma generate");

  // Sync the schema over a direct connection. A failure here must not take the deployment down:
  // the tables are often already in place, and a deployed app that can explain itself beats no
  // deployment at all.
  try {
    run("npx prisma db push --skip-generate", { ...process.env, DATABASE_URL: directUrl(process.env.DATABASE_URL) });
  } catch {
    console.warn("\n[vercel-build] WARNING: could not sync the schema (prisma db push failed). Continuing with the build — the app will say so on screen. Check that the connection string allows a direct connection.\n");
  }
}

// Nothing about the database may fail the deployment. If preparing it throws for any reason —
// an unusable connection string, a provider swap Prisma rejects — fall all the way back to the
// bundled SQLite template, which always works, and let the app explain itself on screen.
try {
  prepareDatabase();
} catch (error) {
  console.warn(`\n[vercel-build] WARNING: database preparation failed (${error?.message ?? error}). Falling back to the bundled SQLite template so the deployment still succeeds.\n`);
  writeFileSync(schemaPath, originalSchema);
  process.env.DATABASE_URL = "file:./template.db";
  run("npx prisma generate");
  try {
    run("npx prisma db push --skip-generate");
  } catch {
    console.warn("[vercel-build] WARNING: could not create the fallback template database either.");
  }
}

run("npx next build");
