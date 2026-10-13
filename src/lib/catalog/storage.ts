// File storage for uploaded invoices, generated CSVs and images.
//
// Two backends, chosen automatically:
//  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (required on Vercel, which has no persistent
//    disk). Stored refs are the blob's public https URL, so images are Shopify-ready as-is.
//  - Local disk under STORAGE_DIR (default ./storage) otherwise. Stored refs are relative paths
//    served by /api/catalog/files/<path>; set `publicBaseUrl` in Settings (or APP_PUBLIC_URL)
//    so uploaded images get public HTTPS URLs for the Shopify CSV.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { findBlobToken } from "./blob-token";

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || (process.env.VERCEL ? "/tmp/storage" : "./storage"));

export type StorageKind = "invoices" | "exports" | "images";

export function usingBlob(): boolean {
  return findBlobToken() !== null;
}

/** Which variable the Blob token was found in, for the status panel. Never the token itself. */
export function blobTokenSource(): string | null {
  return findBlobToken()?.key ?? null;
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function keyFor(kind: StorageKind, filename: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return path.posix.join(kind, month, `${randomUUID().slice(0, 8)}-${safeName(filename)}`);
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", csv: "text/csv; charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain; charset=utf-8",
};

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Persist a buffer; returns a storage ref (relative path on disk, or a public URL on Blob). */
export async function saveFile(kind: StorageKind, filename: string, data: Buffer): Promise<string> {
  const key = keyFor(kind, filename);
  const blobToken = findBlobToken();
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    // Passed explicitly. The SDK falls back to BLOB_READ_WRITE_TOKEN by name, which is the very
    // variable a prefixed store does not set.
    const blob = await put(`catalog/${key}`, data, { access: "public", contentType: contentTypeFor(filename), addRandomSuffix: false, token: blobToken.token });
    return blob.url;
  }
  const abs = path.join(STORAGE_DIR, key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return key;
}

export function isRemoteRef(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

export async function readFile(ref: string): Promise<Buffer> {
  if (isRemoteRef(ref)) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`Could not read stored file (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(resolveStoragePath(ref));
}

/** Resolve a local relative ref, refusing anything outside STORAGE_DIR. */
export function resolveStoragePath(rel: string): string {
  const abs = path.resolve(STORAGE_DIR, rel);
  if (!abs.startsWith(STORAGE_DIR + path.sep)) throw new Error("Invalid storage path");
  return abs;
}

/** App-relative path (or absolute URL for Blob refs) that serves the file. */
export function filePath(ref: string): string {
  if (isRemoteRef(ref)) return ref;
  return `/api/catalog/files/${ref.split("/").map(encodeURIComponent).join("/")}`;
}

/** Public URL for a stored file, or null when no public base URL is configured. */
export function publicFileUrl(ref: string, publicBaseUrl: string): string | null {
  if (isRemoteRef(ref)) return ref;
  const base = (publicBaseUrl || process.env.APP_PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${filePath(ref)}`;
}
