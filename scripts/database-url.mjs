/**
 * Finding the database, for the build.
 *
 * The same rules as src/lib/catalog/db-url.ts, which the running app uses. They have to agree: the
 * build pushes the schema to whatever this says, and the app then reads from whatever that says.
 * When the two drifted apart, the schema went to one database and the app looked at another.
 *
 * This file is plain ESM with no side effects so that the build script and a test can both import
 * it — the test runs both implementations over the same environments and fails if they disagree.
 */

export const PG = /^postgres(ql)?:\/\//i;
export const ACCELERATE = /^prisma\+postgres(ql)?:\/\//i;
const FILE = /^file:/i;

export const DATABASE_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "NEON_DATABASE_URL",
  "PRISMA_DATABASE_URL",
];

/** Variables holding an explicitly unpooled connection, under any store prefix. */
const UNPOOLED_KEY = /(POSTGRES_URL_NON_POOLING|DATABASE_URL_UNPOOLED)$/;

/** Which database a URL names, ignoring whether it is the pooled endpoint. */
function databaseIdentity(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.username}@${parsed.hostname.replace("-pooler.", ".")}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

/** The store prefix a variable was attached under: `Storage_DATABASE_URL` -> `Storage_`. */
function storePrefix(key) {
  const match = /^(.*?_)(?:POSTGRES_URL_NON_POOLING|DATABASE_URL_UNPOOLED|DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL)$/.exec(key);
  return match ? match[1] : "";
}

function fromParts(env) {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = env;
  if (!PGHOST || !PGUSER || !PGDATABASE) return undefined;
  const auth = PGPASSWORD ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}` : encodeURIComponent(PGUSER);
  return { url: `postgresql://${auth}@${PGHOST}${PGPORT ? `:${PGPORT}` : ""}/${PGDATABASE}?sslmode=require`, key: "PGHOST + PGUSER + PGDATABASE" };
}

/** The connection string to use, and the variable it came from. */
export function findUrl(env) {
  for (const pattern of [PG, FILE]) {
    for (const key of DATABASE_ENV_KEYS) {
      const value = env[key];
      if (value && pattern.test(value)) return { url: value, key };
    }
  }
  const scanned = Object.keys(env).filter((key) => typeof env[key] === "string" && PG.test(env[key])).sort()[0];
  if (scanned) return { url: env[scanned], key: scanned };
  return fromParts(env);
}

/** The variable holding a Prisma Accelerate URL, when one is set. */
export function accelerateName(env) {
  return Object.keys(env).filter((key) => typeof env[key] === "string" && ACCELERATE.test(env[key])).sort()[0];
}

/** A connection Prisma's schema engine can push to. See db-url.ts for why each step is here. */
export function directUrl(env) {
  const found = findUrl(env);
  const candidates = Object.keys(env)
    .filter((key) => UNPOOLED_KEY.test(key) && env[key] && PG.test(env[key]))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

  if (candidates.length === 1) return env[candidates[0]];
  if (candidates.length > 1 && found) {
    const wanted = databaseIdentity(found.url);
    const sameDatabase = candidates.find((key) => databaseIdentity(env[key]) === wanted);
    if (sameDatabase) return env[sameDatabase];
    const prefix = storePrefix(found.key);
    const samePrefix = candidates.find((key) => storePrefix(key) === prefix);
    if (samePrefix) return env[samePrefix];
  }

  if (!found || !PG.test(found.url)) return found?.url;
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

/** Env names that look database-related, for the build log. Names only, never values. */
export function databaseShapedNames(env) {
  return Object.keys(env)
    .filter((key) => typeof env[key] === "string" && env[key] !== "" && (PG.test(env[key]) || ACCELERATE.test(env[key]) || /(^|_)(DATABASE|POSTGRES|NEON|PRISMA)_|^PG[A-Z]+$/.test(key)))
    .sort();
}
