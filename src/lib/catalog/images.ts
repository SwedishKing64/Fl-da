// Image sourcing: validate supplier URLs, look up the brand/model image library, and record
// images so they are reused automatically in later seasons.

import { prisma, parseJson } from "./db";
import { isPublicHttpsUrl } from "./csv";

export interface UrlCheck {
  url: string;
  ok: boolean;
  reason?: string;
}

/** Confirm an image URL is public HTTPS and reachable (HEAD, falling back to a ranged GET). */
export async function checkImageUrl(url: string, timeoutMs = 6000): Promise<UrlCheck> {
  if (!isPublicHttpsUrl(url)) return { url, ok: false, reason: "Not a public HTTPS URL" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow", signal: controller.signal });
    }
    if (!res.ok) return { url, ok: false, reason: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.startsWith("image/") && !type.includes("octet-stream")) return { url, ok: false, reason: `Not an image (${type})` };
    return { url, ok: true };
  } catch (err) {
    return { url, ok: false, reason: err instanceof Error && err.name === "AbortError" ? "Timed out" : "Unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

const norm = (s: string) => s.trim().toLowerCase();

/** Find previously sourced images for brand + model code (+ colour, falling back to any colour). */
export async function findLibraryImages(brand: string, modelCode: string, colour = ""): Promise<string[]> {
  if (!brand.trim() || !modelCode.trim()) return [];
  const entries = await prisma.imageLibraryEntry.findMany({ where: { brand: norm(brand), modelCode: norm(modelCode) } });
  if (entries.length === 0) return [];
  const exact = entries.find((e) => e.colour === norm(colour));
  const chosen = exact ?? entries.find((e) => e.colour === "") ?? entries[0];
  return parseJson<string[]>(chosen.urls, []);
}

export async function recordLibraryImages(brand: string, modelCode: string, colour: string, urls: string[], source: "MANUAL" | "SUPPLIER" | "EXPORT"): Promise<void> {
  const clean = Array.from(new Set(urls.filter(isPublicHttpsUrl)));
  if (!brand.trim() || !modelCode.trim() || clean.length === 0) return;
  const key = { brand: norm(brand), modelCode: norm(modelCode), colour: norm(colour) };
  const existing = await prisma.imageLibraryEntry.findUnique({ where: { brand_modelCode_colour: key } });
  const merged = Array.from(new Set([...(existing ? parseJson<string[]>(existing.urls, []) : []), ...clean]));
  await prisma.imageLibraryEntry.upsert({
    where: { brand_modelCode_colour: key },
    create: { ...key, urls: JSON.stringify(merged), source },
    update: { urls: JSON.stringify(merged) },
  });
}
