// File storage: local disk under STORAGE_DIR (default ./storage). Files are served back by
// /api/catalog/files/<path>; set `publicBaseUrl` in Settings (or APP_PUBLIC_URL) so uploaded
// images get public HTTPS URLs for the Shopify CSV. Swap this module for S3 if needed.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage");

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/** Persist a buffer under `<kind>/<yyyy-mm>/<uuid>-<name>` and return its relative storage path. */
export async function saveFile(kind: "invoices" | "exports" | "images", filename: string, data: Buffer): Promise<string> {
  const month = new Date().toISOString().slice(0, 7);
  const rel = path.posix.join(kind, month, `${randomUUID().slice(0, 8)}-${safeName(filename)}`);
  const abs = path.join(STORAGE_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}

export async function readFile(rel: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(rel));
}

/** Resolve a stored relative path, refusing anything outside STORAGE_DIR. */
export function resolveStoragePath(rel: string): string {
  const abs = path.resolve(STORAGE_DIR, rel);
  if (!abs.startsWith(STORAGE_DIR + path.sep)) throw new Error("Invalid storage path");
  return abs;
}

export function filePath(rel: string): string {
  return `/api/catalog/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/** Public URL for a stored file, or null when no public base URL is configured. */
export function publicFileUrl(rel: string, publicBaseUrl: string): string | null {
  const base = (publicBaseUrl || process.env.APP_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${filePath(rel)}`;
}
