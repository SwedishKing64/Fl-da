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

/** Any Postgres connection string, including Prisma Accelerate's `prisma+postgres://` form. */
export const POSTGRES_URL = /^(prisma\+)?postgres(ql)?:\/\//i;
/** A direct Postgres URL, preferred over an Accelerate one when both are present. */
const PLAIN_POSTGRES_URL = /^postgres(ql)?:\/\//i;

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
      return POSTGRES_URL.test(value) || /(^|_)(DATABASE|POSTGRES|NEON|PRISMA)_|^PG[A-Z]+$/.test(key);
    })
    .sort();
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
 * The connection string to use, and the variable it came from. Order of preference:
 * a known name holding a direct Postgres URL, a known name holding any Postgres URL, a known
 * name holding anything at all (a local `file:` URL), any other variable holding a Postgres
 * URL, then Postgres URLs assembled from `PG*` parts.
 */
export function findDatabaseUrl(env: Env = process.env): { url: string; key: string } | undefined {
  for (const pattern of [PLAIN_POSTGRES_URL, POSTGRES_URL]) {
    for (const key of DATABASE_ENV_KEYS) {
      const value = env[key];
      if (value && pattern.test(value)) return { url: value, key };
    }
  }
  for (const key of DATABASE_ENV_KEYS) {
    const value = env[key];
    if (value) return { url: value, key };
  }
  const scanned = Object.keys(env)
    .filter((key) => {
      const value = env[key];
      return typeof value === "string" && POSTGRES_URL.test(value);
    })
    .sort();
  const picked = scanned.find((key) => PLAIN_POSTGRES_URL.test(env[key]!)) ?? scanned[0];
  if (picked) return { url: env[picked]!, key: picked };
  return fromParts(env);
}
