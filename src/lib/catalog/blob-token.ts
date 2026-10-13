/**
 * Finding the Vercel Blob token.
 *
 * The same trap as the database connection string, one store along. Vercel writes
 * `BLOB_READ_WRITE_TOKEN` for the first Blob store attached to a project, but a store attached
 * under a custom prefix — or a second store — is written as `<PREFIX>_BLOB_READ_WRITE_TOKEN`.
 * Looking for the bare name alone means a Blob store that is genuinely connected reads as not
 * connected, uploads fall back to a disk that does not survive the next request on Vercel, and
 * the only sign is images going missing later.
 *
 * So, as with the database, we look at the values rather than guess the name. A Blob token has a
 * documented shape — `vercel_blob_rw_<store id>_<secret>` — which is distinctive enough to find
 * on sight. Tokens are secrets: this module returns them to the caller that needs to sign a
 * request, and everything meant for a screen or a log gets names only.
 *
 * Pure and environment-injectable so it can be tested without a Vercel project.
 */

export type Env = Record<string, string | undefined>;

/** The shape Vercel gives a read-write Blob token. */
export const BLOB_TOKEN = /^vercel_blob_rw_[A-Za-z0-9_-]+$/;

/** The name Vercel uses for a project's first Blob store, checked before anything else. */
export const BLOB_ENV_KEYS = ["BLOB_READ_WRITE_TOKEN"] as const;

/**
 * The token to sign Blob requests with, and the variable it came from.
 *
 * The canonical name wins when it is set, so a project with one store behaves exactly as before.
 * Otherwise the first variable whose value looks like a Blob token is used, which is what picks up
 * a store attached under a prefix. Names are sorted so the choice is the same on every boot rather
 * than depending on the order the environment happens to arrive in.
 */
export function findBlobToken(env: Env = process.env): { key: string; token: string } | null {
  for (const key of BLOB_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value && BLOB_TOKEN.test(value)) return { key, token: value };
  }
  for (const key of Object.keys(env).sort()) {
    const value = env[key]?.trim();
    if (value && BLOB_TOKEN.test(value)) return { key, token: value };
  }
  return null;
}

/**
 * Variables that look Blob-related, for the "why is this not connected" panel. Names only — a
 * token is a write credential for the store and must never reach a screen or a log.
 */
export function blobEnvNamesPresent(env: Env = process.env): string[] {
  return Object.keys(env).filter((k) => /BLOB/i.test(k)).sort();
}
