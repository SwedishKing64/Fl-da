/**
 * Finding the database connection string.
 *
 * Vercel's storage integrations do not agree on a variable name. Neon sets `DATABASE_URL`,
 * Prisma Postgres sets `PRISMA_DATABASE_URL`, Supabase sets `POSTGRES_URL`, and any of them
 * set something else entirely when the store is attached with a custom prefix
 * (`ALPSPORT_DATABASE_URL`). Rather than guess the name, we look at the values: anything that
 * parses as a Postgres URL will do. Values are never logged or rendered — only names.
 *
 * Pure and environment-injectable so it can be unit tested. Keep in sync with
 * scripts/vercel-build.mjs, which repeats this logic for the build step.
 */

export type Env = Record<string, string | undefined>;

/**
 * A direct Postgres connection string. This is the only shape we can use: `prisma db push`
 * needs a direct connection to sync the schema, and the Prisma client here is built without
 * the Accelerate extension, so an Accelerate URL would fail at query time too.
 */
export const POSTGRES_URL = /^postgres(ql)?:\/\//i;
/** Prisma Accelerate / Prisma Postgres. Recognised only so we can explain why it is unusable. */
export const ACCELERATE_URL = /^prisma\+postgres(ql)?:\/\//i;
/** A local SQLite file, the shape used for development. */
const FILE_URL = /^file:/i;

/** Names we check first, most specific to this app's conventions first. */
export const DATABASE_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "NEON_DATABASE_URL",
  "PRISMA_DATABASE_URL",
] as const;

/** Env names that look database-related, for the "why am I seeing this" panel. Names only. */
export function databaseEnvNamesPresent(env: Env = process.env): string[] {
  return Object.keys(env)
    .filter((key) => {
      const value = env[key];
      if (typeof value !== "string" || value === "") return false;
      return POSTGRES_URL.test(value) || ACCELERATE_URL.test(value) || /(^|_)(DATABASE|POSTGRES|NEON|PRISMA)_|^PG[A-Z]+$/.test(key);
    })
    .sort();
}

/**
 * The variable holding a Prisma Accelerate URL, when one is set. A Prisma Postgres store gives
 * you only this, which looks like a connected database but cannot be used here — worth saying
 * out loud rather than reporting "no database".
 */
export function accelerateEnvName(env: Env = process.env): string | undefined {
  return Object.keys(env)
    .filter((key) => {
      const value = env[key];
      return typeof value === "string" && ACCELERATE_URL.test(value);
    })
    .sort()[0];
}

function fromParts(env: Env): { url: string; key: string } | undefined {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = env;
  if (!PGHOST || !PGUSER || !PGDATABASE) return undefined;
  const auth = PGPASSWORD
    ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}`
    : encodeURIComponent(PGUSER);
  const port = PGPORT ? `:${PGPORT}` : "";
  return { url: `postgresql://${auth}@${PGHOST}${port}/${PGDATABASE}?sslmode=require`, key: "PGHOST + PGUSER + PGDATABASE" };
}

/**
 * The connection string to use, and the variable it came from. Order of preference: a known
 * name holding a direct Postgres URL, a known name holding a local `file:` URL, any other
 * variable holding a direct Postgres URL, then one assembled from `PG*` parts. Accelerate URLs
 * are deliberately never returned — see ACCELERATE_URL.
 */
export function findDatabaseUrl(env: Env = process.env): { url: string; key: string } | undefined {
  for (const pattern of [POSTGRES_URL, FILE_URL]) {
    for (const key of DATABASE_ENV_KEYS) {
      const value = env[key];
      if (value && pattern.test(value)) return { url: value, key };
    }
  }
  const scanned = Object.keys(env)
    .filter((key) => {
      const value = env[key];
      return typeof value === "string" && POSTGRES_URL.test(value);
    })
    .sort()[0];
  if (scanned) return { url: env[scanned]!, key: scanned };
  return fromParts(env);
}

/**
 * A connection Prisma's schema engine can push to. Neon hands out a pooled host for serverless
 * queries, but `prisma db push` needs a direct one, so prefer an explicitly unpooled variable
 * and otherwise undo the pooling markers.
 */
export function directDatabaseUrl(env: Env = process.env): string | undefined {
  for (const key of ["POSTGRES_URL_NON_POOLING", "DATABASE_URL_UNPOOLED"]) {
    const value = env[key];
    if (value && POSTGRES_URL.test(value)) return value;
  }
  const found = findDatabaseUrl(env);
  if (!found || !POSTGRES_URL.test(found.url)) return found?.url;
  try {
    const parsed = new URL(found.url);
    parsed.hostname = parsed.hostname.replace("-pooler.", ".");
    parsed.searchParams.delete("pgbouncer");
    parsed.searchParams.delete("connection_limit");
    return parsed.toString();
  } catch {
    return found.url;
  }
}
