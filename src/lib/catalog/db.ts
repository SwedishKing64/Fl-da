import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { findDatabaseUrl } from "./db-url";

export { DATABASE_ENV_KEYS, accelerateEnvName, databaseEnvNamesPresent, directDatabaseUrl, findDatabaseUrl } from "./db-url";

// Single Prisma client per process (Next.js dev hot-reload safe).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; ephemeralDb?: boolean };

/**
 * Resolve the database URL. When none is configured (a fresh Vercel project with no Postgres
 * store yet), fall back to a throwaway copy of the SQLite template built by `vercel-build`.
 */
function resolveDatabaseUrl(): { url: string; ephemeral: boolean } {
  const configured = findDatabaseUrl();
  if (configured) return { url: configured.url, ephemeral: false };
  const template = path.join(process.cwd(), "prisma", "template.db");
  if (!fs.existsSync(template)) {
    throw new Error('DATABASE_URL is not set. Use `npm run demo` for local development, or add a Postgres database to the deployment.');
  }
  const target = path.join(os.tmpdir(), "importer-ephemeral.db");
  if (!fs.existsSync(target)) fs.copyFileSync(template, target);
  return { url: `file:${target}`, ephemeral: true };
}

function createClient(): PrismaClient {
  const { url, ephemeral } = resolveDatabaseUrl();
  globalForPrisma.ephemeralDb = ephemeral;
  return new PrismaClient({
    datasourceUrl: url,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
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

/** True when running on the throwaway SQLite copy (data resets on restart). */
export function isEphemeralDb(): boolean {
  getClient();
  return Boolean(globalForPrisma.ephemeralDb);
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
