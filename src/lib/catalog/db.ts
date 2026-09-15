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
function resolveDatabaseUrl(): { url: string; ephemeral: boolean } | undefined {
  const configured = findDatabaseUrl();
  if (configured) return { url: configured.url, ephemeral: false };
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
  return new PrismaClient({
    datasourceUrl: resolved.url,
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

export async function databaseStatus(): Promise<DatabaseStatus> {
  const resolved = resolveDatabaseUrl();
  if (!resolved) return { state: "missing" };
  const source = resolved.ephemeral ? "the SQLite template bundled with the build" : findDatabaseUrl()?.key ?? "DATABASE_URL";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    if (isProviderMismatch(error)) return { state: "wrong-provider", source, detail: scrub(error) };
    return { state: "unreachable", source, detail: scrub(error) };
  }
  try {
    await prisma.user.count();
  } catch (error) {
    return { state: "no-tables", source, detail: scrub(error) };
  }
  return { state: resolved.ephemeral ? "ephemeral" : "ok", source };
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
