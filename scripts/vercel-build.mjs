// Vercel build. The checked-in Prisma schema targets SQLite for zero-setup local use.
//
//  - With a Postgres DATABASE_URL (Storage → Neon in the Vercel project): switch the datasource
//    provider to postgresql, regenerate the client, sync the schema, build.
//  - Without one: build against a SQLite template database that the app copies to /tmp at
//    runtime. The app works but data resets whenever the serverless instance restarts, and it
//    shows a banner saying so. This keeps a first deploy from failing before storage is added.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Keep in sync with DATABASE_ENV_KEYS in src/lib/catalog/db.ts.
const KEYS = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL_UNPOOLED", "NEON_DATABASE_URL"];
const values = KEYS.map((k) => process.env[k]).filter(Boolean);
const url = values.find((v) => /^postgres(ql)?:/i.test(v)) ?? values[0] ?? "";
const schemaPath = "prisma/schema.prisma";

console.log(`[vercel-build] environment=${process.env.VERCEL_ENV ?? "?"} branch=${process.env.VERCEL_GIT_COMMIT_REF ?? "?"} database variables present: ${KEYS.filter((k) => process.env[k]).join(", ") || "none"}`);

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
