/**
 * A brand whose site is a Shopify store: its products read as data, not as a web page.
 *
 * Burton, among others, sells from a Shopify store, and every Shopify store publishes each
 * product as plain data beside its page — the same words and pictures, with what the page never
 * says out loud: which colour each variant is and which pictures belong to it. So for these sites
 * there is no page to boil down and no colour to guess. The product is fetched as data, the
 * ordered colour's variants are found by name, and the pictures tied to them are the pictures.
 *
 * Only the fetching and the sorting live here; the reading is the same as for any page.
 */

import type { Candidate } from "./page";
import { fullSizePicture } from "../image-url";

/** Where a product's data is, for a link into a Shopify store. Null for any other link. */
export function shopifyProductAddress(link: string): { origin: string; prefix: string; handle: string } | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  const m = /^(\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/collections\/[^/]+)?\/products\/([^/?#]+)/i.exec(u.pathname);
  if (!m) return null;
  return { origin: u.origin, prefix: m[1] ?? "", handle: m[2].replace(/\.(js|json)$/i, "") };
}

export interface StoreVariant { id: number; values: string[]; image?: { src: string; alt: string } }
export interface StoreProduct {
  title: string;
  vendor: string;
  bodyHtml: string;
  /** The option names, in order: "Colour", "Size". */
  options: string[];
  variants: StoreVariant[];
  /** Every picture, in the store's order, with the variants it is tied to where the store says. */
  images: Array<{ src: string; alt: string; variantIds: number[] }>;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
// At its full size: a store's data can carry a cut-down address. See image-url.ts.
const https = (src: string): string => (src ? fullSizePicture(src.startsWith("//") ? `https:${src}` : src) : src);

/** The store's data in one shape, whichever of its two forms it came in. */
export function parseStoreProduct(raw: unknown): StoreProduct | null {
  const p = (raw && typeof raw === "object" && "product" in (raw as object) ? (raw as { product: unknown }).product : raw) as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || !str(p.title) || !Array.isArray(p.variants)) return null;
  const options = Array.isArray(p.options)
    ? (p.options as unknown[]).map((o) => (typeof o === "string" ? o : str((o as Record<string, unknown>)?.name)))
    : [];
  const variants: StoreVariant[] = (p.variants as unknown[]).map((v) => {
    const r = (v ?? {}) as Record<string, unknown>;
    const values = Array.isArray(r.options) ? (r.options as unknown[]).map(str) : [str(r.option1), str(r.option2), str(r.option3)].filter(Boolean);
    const fi = (r.featured_image ?? null) as Record<string, unknown> | null;
    const fm = (r.featured_media ?? null) as Record<string, unknown> | null;
    const src = str(fi?.src) || str((fm?.preview_image as Record<string, unknown> | undefined)?.src);
    return { id: num(r.id), values, image: src ? { src: https(src), alt: str(fi?.alt) || str(fm?.alt) } : undefined };
  });
  const images: StoreProduct["images"] = [];
  const seen = new Set<string>();
  const add = (src: string, alt: string, variantIds: number[]) => {
    const u = https(src);
    if (!u || seen.has(u.replace(/\?.*$/, ""))) return;
    seen.add(u.replace(/\?.*$/, ""));
    images.push({ src: u, alt, variantIds });
  };
  // The ".js" form: media carry the captions, images are bare addresses, variants' pictures are
  // tied to them. The ".json" form: images carry captions and the variants they belong to.
  const media = Array.isArray(p.media) ? (p.media as Array<Record<string, unknown>>) : [];
  for (const m of media) {
    if (m.media_type && m.media_type !== "image") continue;
    const src = str(m.src) || str((m.preview_image as Record<string, unknown> | undefined)?.src);
    if (src) add(src, str(m.alt), []);
  }
  for (const im of Array.isArray(p.images) ? (p.images as unknown[]) : []) {
    if (typeof im === "string") add(im, "", []);
    else if (im && typeof im === "object") {
      const r = im as Record<string, unknown>;
      add(str(r.src), str(r.alt), Array.isArray(r.variant_ids) ? (r.variant_ids as unknown[]).map(num) : []);
    }
  }
  // A variant's own picture is tied to it whatever form the data came in.
  for (const v of variants) {
    if (!v.image) continue;
    const have = images.find((i) => i.src.replace(/\?.*$/, "") === v.image!.src.replace(/\?.*$/, ""));
    if (have) { if (!have.variantIds.includes(v.id)) have.variantIds.push(v.id); if (!have.alt) have.alt = v.image.alt; }
    else images.push({ src: v.image.src, alt: v.image.alt, variantIds: [v.id] });
  }
  return { title: str(p.title).trim(), vendor: str(p.vendor).trim(), bodyHtml: str(p.body_html) || str(p.description), options, variants, images };
}

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** The product's data from the store, or null when the link is not into one or the store will not give it. */
export async function fetchShopifyProduct(link: string, fetcher: typeof fetch = fetch): Promise<{ product: StoreProduct; url: string } | null> {
  const at = shopifyProductAddress(link);
  if (!at) return null;
  const tries = [
    `${at.origin}${at.prefix}/products/${at.handle}.js`,
    `${at.origin}/products/${at.handle}.js`,
    `${at.origin}${at.prefix}/products/${at.handle}.json`,
    `${at.origin}/products/${at.handle}.json`,
  ].filter((u, i, all) => all.indexOf(u) === i);
  for (const url of tries) {
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(12_000), headers: { "user-agent": BROWSER, accept: "application/json,text/javascript;q=0.9,*/*;q=0.5", "accept-language": "en-AU,en;q=0.9" } });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 4 * 1024 * 1024 || !/^\s*[{[]/.test(text)) continue;
      const product = parseStoreProduct(JSON.parse(text));
      if (product) return { product, url };
    } catch {
      // The next form, or none.
    }
  }
  return null;
}

/** The product's data as the page it stands for, for the same boiling-down as any page gets. */
export function storeAsHtml(p: StoreProduct): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const colourAt = p.options.findIndex((o) => /colou?r/i.test(o));
  const colours = colourAt >= 0 ? [...new Set(p.variants.map((v) => v.values[colourAt]).filter(Boolean))] : [];
  return `<html><head><title>${esc(p.title)}</title></head><body><h1>${esc(p.title)}</h1>${p.vendor ? `<p>Brand: ${esc(p.vendor)}</p>` : ""}${colours.length ? `<p>Colours: ${esc(colours.join(", "))}</p>` : ""}${p.bodyHtml}</body></html>`;
}

const plain = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The pictures for the colours ordered: those the store ties to that colour's variants, and those
 * whose caption names the colour, the variant's own first. All of them when no colour is ordered
 * or none of the store's colours is the one ordered — then they are sorted by looking at them.
 */
export function storePictures(p: StoreProduct, colours: string[] = []): { pictures: Candidate[]; matched: string } {
  const all = p.images.map((i) => ({ url: i.src, alt: i.alt }));
  const wanted = colours.map(plain).filter(Boolean);
  const colourAt = p.options.findIndex((o) => /colou?r/i.test(o));
  if (wanted.length === 0 || colourAt < 0) return { pictures: all, matched: "" };
  const fits = (value: string) => { const v = plain(value); return v !== "" && wanted.some((w) => v === w || v.includes(w) || w.includes(v)); };
  const variants = p.variants.filter((v) => fits(v.values[colourAt] ?? ""));
  if (variants.length === 0) return { pictures: all, matched: "" };
  const ids = new Set(variants.map((v) => v.id));
  const matched = variants[0].values[colourAt];
  const own = variants.map((v) => v.image?.src).filter((s): s is string => Boolean(s));
  const chosen = p.images.filter((i) => i.variantIds.some((id) => ids.has(id)) || fits(i.alt));
  const ordered = [...chosen].sort((a, b) => Number(own.includes(b.src)) - Number(own.includes(a.src)));
  return { pictures: ordered.length > 0 ? ordered.map((i) => ({ url: i.src, alt: i.alt || matched })) : all, matched };
}
