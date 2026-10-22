import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { candidateDatabaseUrls, findDatabaseUrl, runtimeDatabaseUrl } from "./db-url";
import { isMissingColumn, isMissingTable } from "./schema-repair";

export { DATABASE_ENV_KEYS, accelerateEnvName, databaseEnvNamesPresent, directDatabaseUrl, findDatabaseUrl } from "./db-url";

// Single Prisma client per process (Next.js dev hot-reload safe).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; ephemeralDb?: boolean; dbOverride?: { url: string; key: string; insteadOf: string } };

/**
 * Resolve the database URL. When none is configured (a fresh Vercel project with no Postgres
 * store yet), fall back to a throwaway copy of the SQLite template built by `vercel-build`.
 */
function resolveDatabaseUrl(): { url: string; ephemeral: boolean } | undefined {
  // A store chosen because the configured one did not answer — see reachableStore.
  if (globalForPrisma.dbOverride) return { url: runtimeDatabaseUrl(globalForPrisma.dbOverride.url), ephemeral: false };
  const configured = findDatabaseUrl();
  if (configured) return { url: runtimeDatabaseUrl(configured.url), ephemeral: false };
  const template = path.join(process.cwd(), "prisma", "template.db");
  if (!fs.existsSync(template)) return undefined;
  const target = path.join(os.tmpdir(), "importer-ephemeral.db");
  if (!fs.existsSync(target)) fs.copyFileSync(template, target);
  return { url: `file:${target}`, ephemeral: true };
}

function createClient(): PrismaClient {
  const resolved = resolveDatabaseUrl();
  if (!resolved) {
    throw new Error("No database is configured. Set DATABASE_URL, or run `npm run demo` for local development.");
  }
  globalForPrisma.ephemeralDb = resolved.ephemeral;
  const client = new PrismaClient({
    datasourceUrl: resolved.url,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  /**
   * Heal a database that is behind the code, rather than falling over in front of the operator.
   *
   * A column added in a release reaches the database through `prisma db push` at build time. That
   * step is best-effort by design — it must never fail a deployment — so when it does not run, the
   * tables are all present and one column is not, and every query against that table throws P2022.
   * The whole app then shows "the page could not be rendered", which reads like a connection
   * problem and is not one.
   *
   * So the first query to hit it adds the missing columns and runs again. Once per process, and
   * only on that one error: everything else is passed straight through.
   */
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (isMissingTable(error)) {
            // A whole table the code expects — one added in a later release — is not there.
            console.error(`[schema] the database is missing a table the code expects; creating what is missing and retrying`);
            await addMissingTables();
            await addMissingColumns();
            return query(args);
          }
          if (!isMissingColumn(error)) throw error;
          console.error(`[schema] the database is missing a column the code expects; adding it and retrying`);
          await addMissingColumns();
          return query(args);
        }
      },
    },
  }) as unknown as PrismaClient;
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/**
 * Lazily-created client: importing this module never touches the database, so pure modules
 * (and their tests) can import files that also import `prisma`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

/** True when running on the throwaway SQLite copy (data resets on restart). Never throws. */
export function isEphemeralDb(): boolean {
  try {
    getClient();
    return Boolean(globalForPrisma.ephemeralDb);
  } catch {
    return false;
  }
}

/**
 * What state the database is actually in. A deployment can fail in several ways that all look
 * identical from the outside — no connection string, a string pointing somewhere unreachable,
 * a reachable database whose tables were never created — and an unexplained 500 helps nobody.
 * This never throws, so a layout can render the reason instead of crashing.
 */
export type DatabaseStatus =
  | { state: "ok"; source: string }
  | { state: "ephemeral"; source: string }
  | { state: "missing"; source?: undefined }
  | { state: "unreachable"; source: string; detail: string }
  | { state: "wrong-provider"; source: string; detail: string }
  | { state: "no-tables"; source: string; detail: string };

/** Strip any credentials Prisma may have echoed back before showing an error on screen. */
function scrub(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstMeaningfulLine = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith("Invalid `") && !line.startsWith("at ")) ?? raw;
  return firstMeaningfulLine.replace(/\/\/[^@\s/]*@/g, "//***@").slice(0, 240);
}

/**
 * Prisma rejecting the URL's protocol, rather than failing to reach it.
 *
 * It means the client was generated against one datasource provider and handed another's URL —
 * a build problem, not a database problem. It is worth telling apart, because it otherwise reads
 * as an unreachable database and sends someone to check a database that is perfectly healthy.
 */
function isProviderMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /the URL must start with the protocol/i.test(message);
}

/**
 * How long a healthy verdict is trusted before checking again.
 *
 * Every page asks this before it renders, and asking cost two queries — on a database in another
 * region that was most of the wait, on every single page, to re-answer a question whose answer
 * had not changed since the process started. A short window keeps the screens working: a database
 * that dies still explains itself within the minute rather than turning into a raw 500.
 */
const HEALTHY_FOR_MS = 60_000;
let healthyUntil = 0;
let healthySource = "";

/** Forget a cached healthy verdict — after creating the tables, the state genuinely has changed. */
export function forgetDatabaseStatus(): void {
  healthyUntil = 0;
}

/** Whether the error is the database not answering at all, as against answering with a refusal. */
function isUnreachable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "P1001" || code === "P1002" || code === "P1017") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /can't reach database server|connection refused|ENOTFOUND|ECONNREFUSED|timed out|ETIMEDOUT/i.test(message);
}

/**
 * Another store that answers, when the configured one does not.
 *
 * Asked of each candidate in turn: does it answer, and how much of this app's data does it hold.
 * The one holding the most import batches is the one the shop has been using; a reachable store
 * with no tables at all is taken only when nothing better answers. Never throws, and never tried
 * twice in one process: the choice is kept, and the gate says which store is in use and why.
 */
async function reachableStore(insteadOf: string): Promise<{ url: string; key: string } | null> {
  const others = candidateDatabaseUrls().filter((c) => c.key !== insteadOf);
  let best: { url: string; key: string; batches: number } | null = null;
  for (const candidate of others) {
    const probe = new PrismaClient({ datasourceUrl: runtimeDatabaseUrl(candidate.url), log: ["error"] });
    try {
      await probe.$queryRaw`SELECT 1`;
      let batches = -1;
      try {
        batches = await probe.importBatch.count();
      } catch {
        // Reachable, but this app's tables are not there: a store nobody set up.
      }
      console.warn(`[db] ${candidate.key} answers (${batches < 0 ? "no tables" : `${batches} batches`}); ${insteadOf} did not.`);
      if (!best || batches > best.batches) best = { ...candidate, batches };
    } catch (error) {
      console.warn(`[db] ${candidate.key} does not answer either: ${scrub(error)}`);
    } finally {
      await probe.$disconnect().catch(() => undefined);
    }
  }
  return best ? { url: best.url, key: best.key } : null;
}

let fellBack = false;

export async function databaseStatus(): Promise<DatabaseStatus> {
  const resolved = resolveDatabaseUrl();
  if (!resolved) return { state: "missing" };
  if (!resolved.ephemeral && Date.now() < healthyUntil) return { state: "ok", source: healthySource };
  const source = resolved.ephemeral
    ? "the SQLite template bundled with the build"
    : globalForPrisma.dbOverride
      ? `${globalForPrisma.dbOverride.key} (${globalForPrisma.dbOverride.insteadOf} did not answer, so the app is using the attached store that holds its data — set DATABASE_URL to it, or remove the dead value)`
      : findDatabaseUrl()?.key ?? "DATABASE_URL";

  // One query, not two. Counting the users answers both questions at once: it can only succeed if
  // the connection works and the tables exist. Only a failure needs telling apart, and a failure
  // is the one case where a second round trip costs nothing anybody is waiting on.
  try {
    await prisma.user.count();
  } catch (error) {
    if (isProviderMismatch(error)) return { state: "wrong-provider", source, detail: scrub(error) };
    const detail = scrub(error);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (reachError) {
      // Nothing answered on the configured string. Before saying so, ask the other stores the
      // project carries — once per process — and carry on with the one that holds the data.
      if (!resolved.ephemeral && !fellBack && !globalForPrisma.dbOverride && isUnreachable(reachError)) {
        fellBack = true;
        const insteadOf = findDatabaseUrl()?.key ?? "DATABASE_URL";
        const store = await reachableStore(insteadOf);
        if (store) {
          globalForPrisma.dbOverride = { ...store, insteadOf };
          globalForPrisma.prisma = createClient();
          console.warn(`[db] using ${store.key} instead of ${insteadOf}`);
          return databaseStatus();
        }
      }
      return { state: "unreachable", source, detail: scrub(reachError) };
    }
    return { state: "no-tables", source, detail };
  }

  if (!resolved.ephemeral) {
    healthyUntil = Date.now() + HEALTHY_FOR_MS;
    healthySource = source;
  }
  return { state: resolved.ephemeral ? "ephemeral" : "ok", source };
}

/**
 * Create the tables, from the DDL shipped with the build.
 *
 * The build normally does this with `prisma db push`, which needs the Prisma CLI and a direct
 * connection. A deployed serverless function has neither, so when the build could not manage it
 * the same statements are applied from here instead, over the connection the app already has.
 *
 * Only ever offered when the tables are genuinely missing: every statement is a bare CREATE, so
 * running it against a database that already has them fails rather than damaging anything.
 */
export async function createTables(): Promise<{ statements: number }> {
  const { schemaStatements } = await import("./schema-sql");
  const statements = schemaStatements();
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  forgetDatabaseStatus();
  return { statements: statements.length };
}

/**
 * Add whatever columns this database is missing.
 *
 * Unlike createTables this is safe to run at any time against any database: every statement is an
 * ADD COLUMN IF NOT EXISTS, so a database already in step is left exactly as it is. Run once per
 * process, the first time a query says a column is missing.
 */
/**
 * Create whatever tables and indexes this database is missing.
 *
 * Every statement is IF NOT EXISTS, so a database already in step is untouched; a foreign key
 * already there fails on its own and is skipped. Once per process, the first time a query says a
 * table is missing.
 */
let tableRepair: Promise<number> | null = null;

/** Whether this copy runs on SQLite (the desktop app) rather than Postgres. */
const onSqlite = (): boolean => (resolveDatabaseUrl()?.url ?? "").startsWith("file:");

export function addMissingTables(): Promise<number> {
  tableRepair ??= (async () => {
    const { tableStatements } = await import("./schema-repair");
    let applied = 0;
    for (const statement of tableStatements(onSqlite() ? "sqlite" : "postgres")) {
      try {
        await prisma.$executeRawUnsafe(statement);
        applied++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/already exists/i.test(message)) console.error(`[schema] ${statement.slice(0, 80)}…: ${message}`);
      }
    }
    forgetDatabaseStatus();
    return applied;
  })();
  return tableRepair;
}

let columnRepair: Promise<number> | null = null;

export function addMissingColumns(): Promise<number> {
  columnRepair ??= (async () => {
    const { columnStatements, sqliteColumns } = await import("./schema-repair");
    let applied = 0;
    if (onSqlite()) {
      // SQLite cannot ADD COLUMN IF NOT EXISTS: each table is asked what it has, and the rest added.
      const have = new Map<string, Set<string>>();
      for (const { table, column, statement } of sqliteColumns()) {
        if (!have.has(table)) {
          const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`).catch(() => []);
          have.set(table, new Set(rows.map((r) => r.name)));
        }
        const columns = have.get(table)!;
        if (columns.size === 0 || columns.has(column)) continue;
        try {
          await prisma.$executeRawUnsafe(statement);
          columns.add(column);
          applied++;
        } catch (error) {
          console.error(`[schema] ${statement}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      forgetDatabaseStatus();
      return applied;
    }
    for (const statement of columnStatements()) {
      try {
        await prisma.$executeRawUnsafe(statement);
        applied++;
      } catch (error) {
        // One column failing must not stop the rest: the point is to get the app running again.
        console.error(`[schema] ${statement}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    forgetDatabaseStatus();
    return applied;
  })();
  return columnRepair;
}

/**
 * How long one trivial query takes, and where the app is running from.
 *
 * Almost all of a slow page here is the wait for the database, and almost all of that wait is
 * distance: a function in Washington talking to a database in Sydney pays about 200ms per query
 * whatever the query is. That is invisible from the outside and guessable only by someone who
 * knows both regions, so the app measures it and says so.
 */
export async function databaseLatency(): Promise<{ ms: number; region: string | null } | null> {
  const region = process.env.VERCEL_REGION ?? null;
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { ms: Date.now() - started, region };
  } catch {
    return null;
  }
}

/** Parse a JSON column, returning `fallback` when the column is empty or malformed. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
