// Vercel build. The checked-in Prisma schema targets SQLite for zero-setup local use.
//
//  - With a Postgres DATABASE_URL (Storage → Neon in the Vercel project): switch the datasource
//    provider to postgresql, regenerate the client, sync the schema, build.
//  - Without one: build against a SQLite template database that the app copies to /tmp at
//    runtime. The app works but data resets whenever the serverless instance restarts, and it
//    shows a banner saying so. This keeps a first deploy from failing before storage is added.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// The rules for finding the database live in one place, shared with the running app — see
// scripts/database-url.mjs. They used to be copied here, and a copy that drifted is how a build
// pushed the schema somewhere other than where the app reads.
import { PG, findUrl, directUrl, accelerateName as findAccelerateName, databaseShapedNames } from "./database-url.mjs";

const accelerateName = findAccelerateName(process.env);
const found = findUrl(process.env);
const url = found?.url ?? "";
const schemaPath = "prisma/schema.prisma";

const dbShaped = databaseShapedNames(process.env);
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

/** The datasource block's provider line, and only that one. */
const DATASOURCE_PROVIDER = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"sqlite"/;

/**
 * Point the datasource at Postgres.
 *
 * Scoped to the datasource block rather than the whole file on purpose. The header comment above
 * it explains this very swap and quotes `provider = "sqlite"` verbatim, so a plain string replace
 * rewrote the comment, left the datasource on SQLite, and shipped a SQLite client that met a
 * postgres:// URL at runtime — which Prisma reports as "the URL must start with the protocol
 * file:", nothing like the connection problem it looks like.
 */
function toPostgres(schema) {
  const swapped = schema.replace(DATASOURCE_PROVIDER, '$1"postgresql"');
  if (DATASOURCE_PROVIDER.test(swapped)) throw new Error("the Prisma datasource is still sqlite after the swap");
  return swapped;
}

/** Point Prisma at the database and create the tables. Everything here is best effort. */
function prepareDatabase() {
  if (PG.test(url)) {
    writeFileSync(schemaPath, toPostgres(originalSchema));
    process.env.DATABASE_URL = url;
    console.log("[vercel-build] Postgres database detected; Prisma provider switched to postgresql");
  } else if (url) {
    console.log(`[vercel-build] Using DATABASE_URL as-is (${url.split(":")[0]}:...)`);
  } else {
    process.env.DATABASE_URL = "file:./template.db"; // relative to prisma/schema.prisma => prisma/template.db
    console.warn("\n[vercel-build] WARNING: no DATABASE_URL. Building with an ephemeral SQLite database; add Storage → Neon (Postgres) to the Vercel project to keep data.\n");
  }

  run("npx prisma generate");

  // The DDL the app falls back to when it finds itself connected to an empty database. Generated
  // whatever happens below, because the case it exists for is this step failing.
  try {
    run("node prisma/generate-schema-sql.mjs");
  } catch (error) {
    console.warn(`[vercel-build] WARNING: could not generate the fallback schema SQL (${error?.message ?? error}).`);
  }

  // Sync the schema. A failure here must not take the deployment down: the tables are often
  // already in place, and a deployed app that can explain itself beats no deployment at all.
  //
  // Tried directly first, then over the pooled connection. Prisma prefers a direct one and Neon's
  // pooler is the usual reason this step fails, but a pooler that accepts DDL beats no tables.
  const direct = directUrl({ ...process.env, DATABASE_URL: process.env.DATABASE_URL });
  const attempts = direct === process.env.DATABASE_URL ? [["the connection string", direct]] : [["a direct connection", direct], ["the pooled connection", process.env.DATABASE_URL]];
  let pushed = false;
  for (const [describe, candidate] of attempts) {
    try {
      console.log(`[vercel-build] syncing the schema over ${describe}`);
      run("npx prisma db push --skip-generate", { ...process.env, DATABASE_URL: candidate });
      pushed = true;
      break;
    } catch (error) {
      // Printed rather than swallowed: without it, a failure here is indistinguishable on screen
      // from a dozen other causes, and the build log is the only place the reason exists.
      console.warn(`[vercel-build] schema sync over ${describe} failed: ${error?.message ?? error}`);
    }
  }
  if (!pushed) {
    console.warn("\n[vercel-build] WARNING: could not sync the schema. Continuing with the build — the app will offer to create the tables itself on first load.\n");
  }
}

// Nothing about the database may fail the deployment. If preparing it throws for any reason —
// an unusable connection string, a provider swap Prisma rejects — fall back to something that
// still builds, and let the app explain itself on screen.
//
// Which fallback depends on what is set. The SQLite template is only a fallback when there is no
// Postgres URL: the app reads DATABASE_URL again at runtime, so a SQLite client next to a live
// postgres:// variable cannot work, and fails in a way that reads like an unreachable database.
// With a Postgres URL present, keep the Postgres client and let the connection speak for itself.
try {
  prepareDatabase();
} catch (error) {
  const reason = error?.message ?? error;
  if (PG.test(url)) {
    console.warn(`\n[vercel-build] WARNING: database preparation failed (${reason}). A Postgres URL is set, so the build keeps the postgresql client rather than falling back to SQLite — the app will report the connection itself.\n`);
    try {
      writeFileSync(schemaPath, toPostgres(originalSchema));
      process.env.DATABASE_URL = url;
      run("npx prisma generate");
    } catch (second) {
      console.warn(`[vercel-build] WARNING: could not generate a Postgres client either (${second?.message ?? second}).`);
    }
  } else {
    console.warn(`\n[vercel-build] WARNING: database preparation failed (${reason}). Falling back to the bundled SQLite template so the deployment still succeeds.\n`);
    writeFileSync(schemaPath, originalSchema);
    process.env.DATABASE_URL = "file:./template.db";
    run("npx prisma generate");
    try {
      run("npx prisma db push --skip-generate");
    } catch {
      console.warn("[vercel-build] WARNING: could not create the fallback template database either.");
    }
  }
}

run("npx next build");
