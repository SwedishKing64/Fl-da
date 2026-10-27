// File storage for uploaded invoices, generated CSVs and images.
//
// Two backends, chosen automatically:
//  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (required on Vercel, which has no persistent
//    disk). On a public store, stored refs are the blob's public https URL, so images are
//    Shopify-ready as-is. On a private store (the business's is one) a blob has no public address,
//    so the ref is a relative path like a file on disk, served by /api/catalog/files/<path>:
//    images to anyone, so Shopify can fetch them; invoices and exports only to a signed-in user.
//  - Local disk under STORAGE_DIR (default ./storage) otherwise. Stored refs are relative paths
//    served by /api/catalog/files/<path>; set `publicBaseUrl` in Settings (or APP_PUBLIC_URL)
//    so uploaded images get public HTTPS URLs for the Shopify CSV.
//  - Pictures only: a licensed copy with neither (a desktop copy, whose own address is
//    127.0.0.1 and no use to Shopify) sends each picture to its vendor, which keeps it in Flöda's
//    own Blob store and answers with the public address. See `setPictureHost`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { findBlobToken } from "./blob-token";
import { isPublicHttpsUrl } from "./csv";

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || (process.env.VERCEL ? "/tmp/storage" : "./storage"));

export type StorageKind = "invoices" | "exports" | "images";

export function usingBlob(): boolean {
  return findBlobToken() !== null;
}

let pictureHost: { server: string; key: string } | null = null;

/** Where a copy without storage of its own sends pictures: its vendor, with its licence key. Null when it has nowhere. */
export function setPictureHost(next: { server: string; key: string } | null): void {
  pictureHost = next && next.server && next.key ? { server: next.server.replace(/\/+$/, ""), key: next.key } : null;
}

/** Whether a picture kept here comes out with a public address Shopify can fetch: Blob, or the vendor's store. */
export function pictureHosting(): boolean {
  return usingBlob() || pictureHost !== null;
}

/** How long one picture may take to reach the vendor. */
const PUBLISH_MS = 30_000;

/** Send a picture to the vendor's store; the public address it was given. Throws when it could not be kept there. */
async function publishPicture(filename: string, data: Buffer): Promise<string> {
  if (!pictureHost) throw new Error("No picture host");
  const res = await fetch(`${pictureHost.server}/api/licence/picture`, {
    method: "POST",
    headers: { authorization: `Bearer ${pictureHost.key}`, "content-type": contentTypeFor(filename), "x-floda-name": safeName(filename) },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(PUBLISH_MS),
  });
  const answer = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; why?: string } | null;
  if (!res.ok || !answer?.ok || !answer.url) throw new Error(answer?.why || `Flöda answered ${res.status} without keeping the picture`);
  return answer.url;
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

/**
 * Whether the Blob store is private, learned from the first file saved: a store is made public or
 * private when it is created in Vercel, and a public save into a private one is refused.
 */
let privateStore: boolean | null = null;

/** The Blob SDK's refusal of a public save into a private store. */
export const isPrivateStoreRefusal = (err: unknown): boolean => err instanceof Error && /private store/i.test(err.message);

/** Persist a buffer; returns a storage ref (a relative path, a public URL on a public Blob store, or a public URL at the vendor). */
export async function saveFile(kind: StorageKind, filename: string, data: Buffer): Promise<string> {
  const key = keyFor(kind, filename);
  const blobToken = findBlobToken();
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    // Passed explicitly. The SDK falls back to BLOB_READ_WRITE_TOKEN by name, which is the very
    // variable a prefixed store does not set.
    const options = { contentType: contentTypeFor(filename), addRandomSuffix: false, token: blobToken.token };
    if (privateStore !== true) {
      try {
        const blob = await put(`catalog/${key}`, data, { ...options, access: "public" });
        privateStore = false;
        return blob.url;
      } catch (err) {
        if (!isPrivateStoreRefusal(err)) throw err;
        privateStore = true;
      }
    }
    await put(`catalog/${key}`, data, { ...options, access: "private" });
    return key;
  }
  if (kind === "images" && pictureHost) {
    // A picture is for Shopify to fetch, so it goes where Shopify can reach it. One the vendor
    // could not keep is kept here instead, and comes out without a public address like any other.
    try {
      return await publishPicture(filename, data);
    } catch (err) {
      console.warn("[storage] the vendor did not keep a picture, keeping it here:", err instanceof Error ? err.message : err);
    }
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
  const kept = await readPrivateBlob(ref);
  if (kept) return kept;
  return fs.readFile(resolveStoragePath(ref));
}

/** A relative ref read from a private Blob store, or null where there is no store or no such file. */
export async function readPrivateBlob(ref: string): Promise<Buffer | null> {
  const blobToken = findBlobToken();
  if (!blobToken || ref.split("/").some((part) => part === ".." || part === "")) return null;
  const { get } = await import("@vercel/blob");
  const got = await get(`catalog/${ref}`, { access: "private", token: blobToken.token }).catch(() => null);
  if (!got || got.statusCode !== 200) return null;
  return Buffer.from(await new Response(got.stream).arrayBuffer());
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

/**
 * Public URL for a stored file, or null when it has none: no public base URL is configured, or
 * the one configured is not public. A desktop copy's own address is 127.0.0.1, and a listing
 * carrying that would be refused by the export, so it is no address at all here.
 */
export function publicFileUrl(ref: string, publicBaseUrl: string): string | null {
  if (isRemoteRef(ref)) return ref;
  const base = (publicBaseUrl || process.env.APP_PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/+$/, "");
  if (!base) return null;
  const url = `${base}${filePath(ref)}`;
  return isPublicHttpsUrl(url) ? url : null;
}
