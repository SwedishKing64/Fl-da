import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accelerateEnvName, databaseEnvNamesPresent, directDatabaseUrl, findDatabaseUrl, type Env } from "./db-url";

const PG = "postgresql://u:p@db.example.com/main?sslmode=require";

describe("database url discovery", () => {
  it("prefers DATABASE_URL when it holds a Postgres URL", () => {
    expect(findDatabaseUrl({ DATABASE_URL: PG, POSTGRES_URL: "postgres://other/x" })).toEqual({ url: PG, key: "DATABASE_URL" });
  });

  it("prefers a direct Postgres URL over a Prisma Accelerate one", () => {
    const found = findDatabaseUrl({ DATABASE_URL: "prisma+postgres://accelerate/x", POSTGRES_URL: PG });
    expect(found).toEqual({ url: PG, key: "POSTGRES_URL" });
  });

  it("never returns an Accelerate URL, because the schema push and client cannot use one", () => {
    expect(findDatabaseUrl({ PRISMA_DATABASE_URL: "prisma+postgres://accelerate/x" })).toBeUndefined();
    expect(accelerateEnvName({ PRISMA_DATABASE_URL: "prisma+postgres://accelerate/x" })).toBe("PRISMA_DATABASE_URL");
  });

  it("reports an Accelerate variable as present so the gate can explain it", () => {
    expect(databaseEnvNamesPresent({ PRISMA_DATABASE_URL: "prisma+postgres://accelerate/x" })).toEqual(["PRISMA_DATABASE_URL"]);
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

  it("unpools a Neon connection string for the schema push", () => {
    const pooled = "postgresql://u:p@ep-x-123-pooler.ap-southeast-2.aws.neon.tech/main?sslmode=require&pgbouncer=true";
    expect(directDatabaseUrl({ DATABASE_URL: pooled })).toBe(
      "postgresql://u:p@ep-x-123.ap-southeast-2.aws.neon.tech/main?sslmode=require",
    );
  });

  it("prefers an explicitly unpooled variable for the schema push", () => {
    const direct = "postgresql://u:p@direct.example.com/main";
    expect(directDatabaseUrl({ DATABASE_URL: PG, POSTGRES_URL_NON_POOLING: direct })).toBe(direct);
  });
});

describe("switching the checked-in schema to Postgres", () => {
  // The build script rewrites prisma/schema.prisma before generating the client. It used to do it
  // with a plain string replace, which hit the header comment above the datasource — the comment
  // explains this very swap and quotes `provider = "sqlite"` verbatim. The datasource stayed on
  // SQLite, Vercel shipped a SQLite client, and it met a postgres:// URL at runtime.
  const DATASOURCE_PROVIDER = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"sqlite"/;
  const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

  it("has the trap still in the file, so this test is testing something real", () => {
    expect(schema.indexOf('provider = "sqlite"')).toBeLessThan(schema.indexOf("datasource db"));
  });

  it("switches the datasource and leaves the comment alone", () => {
    const swapped = schema.replace(DATASOURCE_PROVIDER, '$1"postgresql"');
    expect(swapped).toMatch(/datasource\s+db\s*\{[^}]*provider\s*=\s*"postgresql"/);
    expect(swapped).not.toMatch(DATASOURCE_PROVIDER);
    // The comment is documentation for a person; rewriting it makes it say nothing.
    expect(swapped).toContain('`provider = "sqlite"` to `provider = "postgresql"`');
  });

  it("is what the build script actually runs", () => {
    const script = readFileSync(new URL("../../../scripts/vercel-build.mjs", import.meta.url), "utf8");
    expect(script).toContain(String(DATASOURCE_PROVIDER));
    expect(script).not.toContain(`originalSchema.replace('provider = "sqlite"'`);
  });
});

describe("finding a connection Prisma can push a schema to", () => {
  // A Vercel project with a Neon store attached under a prefix. The unpooled URLs are right
  // there, named Storage_* — looking only for the bare names found nothing and fell through to
  // rewriting the hostname, which is how a deploy ended up connected to an empty database.
  const pooled = "postgresql://u:p@ep-x-pooler.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
  const direct = "postgresql://u:p@ep-x.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";

  it("uses a prefixed unpooled variable when that is all there is", () => {
    expect(directDatabaseUrl({ DATABASE_URL: pooled, Storage_DATABASE_URL_UNPOOLED: direct })).toBe(direct);
  });

  it("still prefers the bare name when both exist", () => {
    const other = "postgresql://u:p@ep-x.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&application_name=bare";
    expect(directDatabaseUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: other, Storage_DATABASE_URL_UNPOOLED: direct })).toBe(other);
  });

  it("picks the store the app is actually connected to when two are attached", () => {
    // Storage1_ is a second Neon project. Pushing the schema there would report success and leave
    // the app looking at an empty database.
    const elsewhere = "postgresql://u2:p2@ep-y.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
    expect(directDatabaseUrl({ DATABASE_URL: pooled, Storage_DATABASE_URL_UNPOOLED: direct, Storage1_DATABASE_URL_UNPOOLED: elsewhere })).toBe(direct);
  });

  it("falls back to the matching store prefix when no candidate names the same database", () => {
    // Supabase gives a pooled host no textual relation to its direct one, so matching on the
    // database itself legitimately fails here and the prefix is what is left to go on.
    const supabasePooled = "postgresql://postgres.abc:p@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
    const supabaseDirect = "postgresql://postgres:p@db.abc.supabase.co:5432/postgres";
    const elsewhere = "postgresql://postgres:p@db.xyz.supabase.co:5432/postgres";
    const env = {
      Alpsport_POSTGRES_URL: supabasePooled,
      Alpsport_POSTGRES_URL_NON_POOLING: supabaseDirect,
      Zebra_POSTGRES_URL_NON_POOLING: elsewhere,
    };
    // The connection in use is the Alpsport store's, so the schema push must go to that one.
    expect(findDatabaseUrl(env)?.key).toBe("Alpsport_POSTGRES_URL");
    expect(directDatabaseUrl(env)).toBe(supabaseDirect);
  });

  it("trusts a single unpooled variable even when its host looks unrelated", () => {
    // The Supabase shape again, with one store. Requiring the hosts to look alike would reject
    // the only direct connection there is.
    const supabaseDirect = "postgresql://postgres:p@db.abc.supabase.co:5432/postgres";
    expect(directDatabaseUrl({ DATABASE_URL: pooled, Storage_POSTGRES_URL_NON_POOLING: supabaseDirect })).toBe(supabaseDirect);
  });

  it("falls back to undoing the pooling markers when no unpooled variable matches", () => {
    const out = directDatabaseUrl({ DATABASE_URL: `${pooled}&pgbouncer=true` });
    expect(out).toContain("ep-x.c-2.ap-southeast-2.aws.neon.tech");
    expect(out).not.toContain("pgbouncer");
  });

  it("is the same rule the build script uses", () => {
    // Not a copy to keep in step: the build imports it.
    const script = readFileSync(new URL("../../../scripts/vercel-build.mjs", import.meta.url), "utf8");
    expect(script).toContain('from "./database-url.mjs"');
    expect(script).not.toMatch(/function directUrl\(/);
  });
});

describe("the DDL shipped for a build that could not push the schema", () => {
  it("is every table the app needs, as separate statements", async () => {
    const { schemaStatements, SCHEMA_SQL } = await import("./schema-sql");
    const statements = schemaStatements();
    expect(statements.length).toBeGreaterThan(60);
    // No comment blocks and nothing empty: each entry is executable on its own.
    for (const statement of statements) expect(statement).toMatch(/^(CREATE|ALTER)\s/i);
    // Postgres, not the SQLite the schema is checked in as.
    expect(SCHEMA_SQL).toContain("TIMESTAMP(3)");
    expect(SCHEMA_SQL).not.toContain("DATETIME");
    // The tables and columns this app's newer features need.
    for (const table of ["User", "ImportBatch", "Product", "Variant", "BatchInstruction", "ExportFeedback"]) {
      expect(SCHEMA_SQL).toContain(`CREATE TABLE "${table}"`);
    }
    for (const column of ["lookupStatus", "lookupSource", "lookupAt", "directives"]) {
      expect(SCHEMA_SQL).toContain(`"${column}"`);
    }
  });
});


describe("the build and the app agree on which database to use", () => {
  // The whole outage was these two disagreeing: the build pushed the schema to one place and the
  // app read from another. They now share a module, and this walks both over the same
  // environments so a future divergence fails here rather than on a deployment.
  const neonPooled = "postgresql://u:p@ep-x-pooler.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
  const neonDirect = "postgresql://u:p@ep-x.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
  const otherStore = "postgresql://u2:p2@ep-y.c-2.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
  const supabaseDirect = "postgresql://postgres:p@db.abc.supabase.co:5432/postgres";

  const environments: Record<string, Env> = {
    "nothing set": {},
    "a bare url": { DATABASE_URL: neonPooled },
    "the shape this project has": {
      DATABASE_URL: neonPooled,
      Storage_DATABASE_URL: neonPooled,
      Storage_DATABASE_URL_UNPOOLED: neonDirect,
      Storage_POSTGRES_URL_NON_POOLING: neonDirect,
      Storage1_DATABASE_URL: otherStore,
      Storage1_DATABASE_URL_UNPOOLED: otherStore,
    },
    "a prefixed store on its own": { Alpsport_POSTGRES_URL: neonPooled, Alpsport_POSTGRES_URL_NON_POOLING: supabaseDirect },
    "unpooled only": { DATABASE_URL_UNPOOLED: neonDirect },
    "an accelerate url": { PRISMA_DATABASE_URL: "prisma+postgres://accelerate.prisma-data.net/?api_key=x" },
    "loose parts": { PGHOST: "db.example.com", PGUSER: "u", PGPASSWORD: "p", PGDATABASE: "main" },
    "local sqlite": { DATABASE_URL: "file:./dev.db" },
  };

  it.each(Object.keys(environments))("agrees on %s", async (name) => {
    const build = await import("../../../scripts/database-url.mjs");
    const env = environments[name];
    expect(build.findUrl(env)?.url).toBe(findDatabaseUrl(env)?.url);
    expect(build.findUrl(env)?.key).toBe(findDatabaseUrl(env)?.key);
    expect(build.directUrl(env)).toBe(directDatabaseUrl(env));
    expect(build.accelerateName(env)).toBe(accelerateEnvName(env));
    expect(build.databaseShapedNames(env)).toEqual(databaseEnvNamesPresent(env));
  });
});
