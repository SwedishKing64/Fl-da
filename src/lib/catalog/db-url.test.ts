import { describe, expect, it } from "vitest";
import { databaseEnvNamesPresent, findDatabaseUrl } from "./db-url";

const PG = "postgresql://u:p@db.example.com/main?sslmode=require";

describe("database url discovery", () => {
  it("prefers DATABASE_URL when it holds a Postgres URL", () => {
    expect(findDatabaseUrl({ DATABASE_URL: PG, POSTGRES_URL: "postgres://other/x" })).toEqual({ url: PG, key: "DATABASE_URL" });
  });

  it("prefers a direct Postgres URL over a Prisma Accelerate one", () => {
    const found = findDatabaseUrl({ DATABASE_URL: "prisma+postgres://accelerate/x", POSTGRES_URL: PG });
    expect(found).toEqual({ url: PG, key: "POSTGRES_URL" });
  });

  it("falls back to an Accelerate URL when that is all there is", () => {
    const url = "prisma+postgres://accelerate/x";
    expect(findDatabaseUrl({ PRISMA_DATABASE_URL: url })).toEqual({ url, key: "PRISMA_DATABASE_URL" });
  });

  it("keeps a local file: URL for SQLite development", () => {
    expect(findDatabaseUrl({ DATABASE_URL: "file:./dev.db" })).toEqual({ url: "file:./dev.db", key: "DATABASE_URL" });
  });

  it("finds a Postgres URL under a store-prefixed name nobody could guess", () => {
    expect(findDatabaseUrl({ ALPSPORT_STORE_DATABASE_URL: PG })).toEqual({ url: PG, key: "ALPSPORT_STORE_DATABASE_URL" });
  });

  it("assembles a URL from PG parts when no full URL is set", () => {
    const found = findDatabaseUrl({ PGHOST: "db.example.com", PGUSER: "u", PGPASSWORD: "p@ss", PGDATABASE: "main", PGPORT: "5433" });
    expect(found?.url).toBe("postgresql://u:p%40ss@db.example.com:5433/main?sslmode=require");
  });

  it("returns nothing when the environment genuinely has no database", () => {
    expect(findDatabaseUrl({ NODE_ENV: "production", SHOPIFY_TOKEN: "abc" })).toBeUndefined();
  });

  it("lists database-shaped names without ever exposing a value", () => {
    const names = databaseEnvNamesPresent({ DATABASE_URL: PG, PGHOST: "db.example.com", SHOPIFY_TOKEN: "abc", EMPTY: "" });
    expect(names).toEqual(["DATABASE_URL", "PGHOST"]);
    expect(names.join(" ")).not.toContain("p@db.example.com");
  });
});
