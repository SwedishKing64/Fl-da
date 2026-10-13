import { describe, expect, it } from "vitest";
import { columnStatements, isMissingColumn, isMissingTable, tableStatements } from "./schema-repair";
import { SCHEMA_SQL } from "./schema-sql";

/**
 * A column added in a release is how this app went down.
 *
 * The build applies schema changes with `prisma db push`, which is best-effort on purpose — it must
 * never fail a deployment. When it does not run, every table is present and one column is not, and
 * every query against that table throws P2022. The app then shows "the page could not be rendered",
 * which reads like a connection problem and is not one. Neither recovery path helped: `prisma db
 * push` needs the CLI, and the bundled fallback is bare CREATE TABLE statements that fail on a
 * database that already has its tables.
 *
 * Reproduced against a real Postgres built from the previous release's schema, which failed with
 * "The column `ImportBatch.builtBy` does not exist in the current database", and fixed there:
 * the first query now adds what is missing and runs again.
 */
describe("adding the columns a database is missing", () => {
  const statements = columnStatements();

  it("covers every column of every table in the shipped DDL", () => {
    const tables = [...SCHEMA_SQL.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(20);
    for (const table of tables) {
      expect(statements.some((s) => s.startsWith(`ALTER TABLE "${table}" `)), table).toBe(true);
    }
    // One per column, and the count is stable: 245 against a real database, matching exactly the
    // number of columns information_schema reports for the generated schema.
    expect(statements.length).toBeGreaterThan(200);
  });

  it("is safe to run against a database that already has them", () => {
    for (const s of statements) expect(s).toContain("ADD COLUMN IF NOT EXISTS");
  });

  it("never tries to add a required column to a table that may have rows", () => {
    // Postgres refuses NOT NULL with no default on a non-empty table. A nullable column Prisma
    // believes is required is a much smaller problem than an app that will not start.
    for (const s of statements) {
      if (/NOT NULL/i.test(s)) expect(s, s).toMatch(/DEFAULT/i);
    }
  });

  it("carries the defaults across, so existing rows get a value", () => {
    expect(statements).toContain(`ALTER TABLE "ImportBatch" ADD COLUMN IF NOT EXISTS "builtBy" TEXT NOT NULL DEFAULT ''`);
    expect(statements).toContain(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lookupStatus" TEXT NOT NULL DEFAULT 'NONE'`);
  });

  it("does not mistake a constraint line for a column", () => {
    for (const s of statements) expect(s).not.toMatch(/CONSTRAINT|PRIMARY KEY/i);
  });

  it("recognises the error that means the database is behind the code", () => {
    expect(isMissingColumn({ code: "P2022" })).toBe(true);
    expect(isMissingColumn(new Error("The column `ImportBatch.builtBy` does not exist in the current database."))).toBe(true);
    expect(isMissingColumn(new Error("Connection refused"))).toBe(false);
    expect(isMissingColumn(null)).toBe(false);
  });
});

describe("the client heals itself", () => {
  it("retries the query once after adding what was missing", async () => {
    const db = await import("node:fs").then((fs) => fs.readFileSync(new URL("./db.ts", import.meta.url), "utf8"));
    expect(db).toContain("$allOperations");
    expect(db).toContain("addMissingColumns");
    // Only that one error is handled; everything else is passed straight through.
    expect(db).toMatch(/if \(!isMissingColumn\(error\)\) throw error;/);
    expect(db).toMatch(/if \(isMissingTable\(error\)\) \{/);
  });
});

describe("a whole table the database is missing", () => {
  it("is created with IF NOT EXISTS, indexes too, so a database in step is untouched", () => {
    const statements = tableStatements();
    const tables = statements.filter((s) => /^CREATE TABLE/.test(s));
    expect(tables.length).toBeGreaterThan(20);
    expect(tables.every((s) => s.startsWith("CREATE TABLE IF NOT EXISTS \""))).toBe(true);
    expect(statements.some((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "ShopListing"'))).toBe(true);
    expect(statements.filter((s) => /^CREATE (UNIQUE )?INDEX/.test(s)).every((s) => / IF NOT EXISTS "/.test(s))).toBe(true);
  });

  it("is told from a column, by Prisma's code or its message", () => {
    expect(isMissingTable({ code: "P2021" })).toBe(true);
    expect(isMissingTable(new Error("The table `public.ShopListing` does not exist in the current database."))).toBe(true);
    expect(isMissingTable({ code: "P2022" })).toBe(false);
    expect(isMissingTable(new Error("Connection refused"))).toBe(false);
  });
});
