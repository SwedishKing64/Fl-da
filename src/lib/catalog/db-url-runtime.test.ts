import { describe, expect, it } from "vitest";
import { runtimeDatabaseUrl } from "./db-url";

describe("the connection string the running app uses", () => {
  it("tells Prisma a pooled Neon endpoint is PgBouncer, so it does without prepared statements", () => {
    const pooled = "postgresql://u:p@ep-x-123-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require";
    expect(runtimeDatabaseUrl(pooled)).toBe(`${pooled}&pgbouncer=true`);
    expect(runtimeDatabaseUrl("postgresql://u:p@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres")).toContain("pgbouncer=true");
  });

  it("leaves a URL that already says so, a direct host and a SQLite file exactly as they are", () => {
    const said = "postgresql://u:p@ep-x-123-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require&pgbouncer=true";
    expect(runtimeDatabaseUrl(said)).toBe(said);
    const direct = "postgresql://u:p@ep-x-123.ap-southeast-2.aws.neon.tech/main?sslmode=require";
    expect(runtimeDatabaseUrl(direct)).toBe(direct);
    expect(runtimeDatabaseUrl("file:./dev.db")).toBe("file:./dev.db");
  });
});
