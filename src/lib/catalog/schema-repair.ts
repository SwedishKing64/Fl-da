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

import { SCHEMA_SQL, SCHEMA_SQL_SQLITE, schemaStatements } from "./schema-sql";

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

/**
 * Every table, index and foreign key in the schema, each written so that a database already
 * holding it is left alone: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS. A whole table
 * added in a release — ShopListing, the shop's own listings — was missing from a database the
 * build step never reached, and every query against it failed with P2021 while the columns
 * repair, which only ever adds columns, had nothing to add. A foreign key has no IF NOT EXISTS,
 * so those are applied and a failure on one already there is ignored by the caller.
 */
export function tableStatements(dialect: "postgres" | "sqlite" = "postgres"): string[] {
  return schemaStatements(dialect)
    .map((statement) =>
      statement
        .replace(/^CREATE TABLE "/, 'CREATE TABLE IF NOT EXISTS "')
        .replace(/^CREATE UNIQUE INDEX "/, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
        .replace(/^CREATE INDEX "/, 'CREATE INDEX IF NOT EXISTS "'),
    );
}

/**
 * The columns of each table, as SQLite adds them to a table that already has rows.
 *
 * A desktop copy keeps its own database across upgrades, and SQLite has no ADD COLUMN IF NOT
 * EXISTS: the caller asks each table which columns it has (PRAGMA table_info) and adds the rest.
 * SQLite also refuses to add a column whose default is not a constant, or one that is NOT NULL with
 * no default; such a column is added nullable and with no default, as Postgres's are above.
 */
export function sqliteColumns(): Array<{ table: string; column: string; statement: string }> {
  const out: Array<{ table: string; column: string; statement: string }> = [];
  for (const [, table, body] of SCHEMA_SQL_SQLITE.matchAll(CREATE_TABLE)) {
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      if (!line.startsWith('"') || /PRIMARY KEY/i.test(line)) continue;
      const match = /^"(\w+)"\s+(.+)$/.exec(line);
      if (!match) continue;
      const [, column, rest] = match;
      const constantDefault = /DEFAULT/i.test(rest) && !/DEFAULT\s+CURRENT_TIMESTAMP/i.test(rest);
      const definition = constantDefault ? rest : rest.replace(/\s*DEFAULT\s+CURRENT_TIMESTAMP\s*/i, " ").replace(/\s*NOT NULL\s*/i, " ").trim();
      out.push({ table, column, statement: `ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}` });
    }
  }
  return out;
}

/** True for the Prisma error that means a whole table the code expects is not there. */
export function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "P2021") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /table .* does not exist/i.test(message) || /relation "[^"]+" does not exist/i.test(message);
}
