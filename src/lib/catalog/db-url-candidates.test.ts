import { describe, expect, it } from "vitest";
import { candidateDatabaseUrls } from "./db-url";

describe("every connection string the project carries, in the order worth trying", () => {
  const env = {
    DATABASE_URL: "postgresql://u:p@ep-dead-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require",
    Storage_DATABASE_URL: "postgresql://u:p@ep-live-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require",
    Storage_DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-live.ap-southeast-2.aws.neon.tech/main?sslmode=require",
    Storage1_DATABASE_URL: "postgresql://u:p@ep-other-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require",
    Storage1_POSTGRES_PRISMA_URL: "postgresql://u:p@ep-other-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require&pgbouncer=true",
    Storage_NEON_PROJECT_ID: "not-a-url",
    PATH: "/usr/bin",
  };

  it("puts the configured one first, then each store's pooled string, then the direct ones", () => {
    expect(candidateDatabaseUrls(env).map((c) => c.key)).toEqual([
      "DATABASE_URL",
      "Storage1_DATABASE_URL",
      "Storage_DATABASE_URL",
      "Storage1_POSTGRES_PRISMA_URL",
      "Storage_DATABASE_URL_UNPOOLED",
    ]);
  });

  it("never offers the same string twice, and nothing that is not a Postgres URL", () => {
    const urls = candidateDatabaseUrls(env).map((c) => c.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => u.startsWith("postgresql://"))).toBe(true);
    expect(candidateDatabaseUrls({ DATABASE_URL: "file:./dev.db" })).toEqual([]);
  });
});
