// Vercel build: the checked-in Prisma schema targets SQLite for zero-setup local use, but
// Vercel has no persistent disk, so when DATABASE_URL points at Postgres we switch the
// datasource provider, regenerate the client, sync the schema, then build.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";
const schemaPath = "prisma/schema.prisma";

if (!url) {
  console.error("\n[vercel-build] DATABASE_URL is not set. Add a Postgres database (Storage → Neon) to the Vercel project first.\n");
  process.exit(1);
}
if (/^postgres(ql)?:/i.test(url)) {
  const schema = readFileSync(schemaPath, "utf8").replace('provider = "sqlite"', 'provider = "postgresql"');
  writeFileSync(schemaPath, schema);
  console.log("[vercel-build] Prisma provider switched to postgresql");
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;
}

const run = (cmd) => {
  console.log(`[vercel-build] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};
run("npx prisma generate");
run("npx prisma db push --skip-generate");
run("npx next build");
