/**
 * Adding the columns a deployed database is missing.
 *
 * The build runs `prisma db push`, and when that cannot reach the database the app falls back to
 * the CREATE TABLE statements shipped in the bundle. Between them they handle a database with no
 * tables. Neither handles the far more common case: the tables are there, and one column added in
 * a later release is not — every query against that table then fails with P2022 and the whole app
 * goes down with "the page could not be rendered".
 *
 * That is what a single new column did. So the columns are derived from the same shipped DDL and
 * applied with ADD COLUMN IF NOT EXISTS, which is safe to run against any database at any time:
 * a database that already has them is untouched.
 *
 * A column that Prisma declares NOT NULL with no default is added nullable. Postgres refuses to
 * add a NOT NULL column to a table that already has rows, and a nullable column Prisma believes
 * is required is a far smaller problem than an application that will not start.
 */

import { SCHEMA_SQL } from "./schema-sql";

const CREATE_TABLE = /CREATE TABLE "(\w+)" \(([\s\S]*?)\n\);/g;

/** One ADD COLUMN IF NOT EXISTS per column in the schema, in table order. */
export function columnStatements(): string[] {
  const out: string[] = [];
  for (const [, table, body] of SCHEMA_SQL.matchAll(CREATE_TABLE)) {
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      if (!line.startsWith('"')) continue; // CONSTRAINT lines and blanks
      const match = /^"(\w+)"\s+(.+)$/.exec(line);
      if (!match) continue;
      const [, column, rest] = match;
      const definition = /DEFAULT/i.test(rest) ? rest : rest.replace(/\s*NOT NULL\s*/i, " ").trim();
      out.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${definition}`);
    }
  }
  return out;
}

/** True for the Prisma error that means the database is behind the code. */
export function isMissingColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "P2022") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /does not exist in the current database/i.test(message) || /column .* does not exist/i.test(message);
}
