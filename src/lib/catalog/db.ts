import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Single Prisma client per process (Next.js dev hot-reload safe).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; ephemeralDb?: boolean };

/**
 * Resolve the database URL. When none is configured (a fresh Vercel project with no Postgres
 * store yet), fall back to a throwaway copy of the SQLite template built by `vercel-build`.
 */
/**
 * Environment variables that Vercel Storage integrations (Neon, Prisma Postgres, Supabase) and
 * hand-written configs use for the connection string. Keep in sync with scripts/vercel-build.mjs.
 */
export const DATABASE_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "NEON_DATABASE_URL",
] as const;

/** Names of the database variables that are set in this process (values are never exposed). */
export function databaseEnvKeysPresent(): string[] {
  return DATABASE_ENV_KEYS.filter((key) => Boolean(process.env[key]));
}

/** The configured connection string, preferring a plain postgres:// URL over a prisma+postgres:// one. */
export function configuredDatabaseUrl(): string | undefined {
  const values = DATABASE_ENV_KEYS.map((key) => process.env[key]).filter((v): v is string => Boolean(v));
  return values.find((v) => /^postgres(ql)?:/i.test(v)) ?? values[0];
}

function resolveDatabaseUrl(): { url: string; ephemeral: boolean } {
  const configured = configuredDatabaseUrl();
  if (configured) return { url: configured, ephemeral: false };
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
