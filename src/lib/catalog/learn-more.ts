/**
 * More that a shop's own export shows about how it lists, beyond the types and tags learn.ts
 * reads: the shape of its SEO titles, and the margin each brand is sold at.
 *
 * Both are patterns in the rows, not guesses: an SEO title pattern is kept only where most of the
 * products follow it, and a brand's margin only where enough products agree on it. Pure, so the
 * page reads the file on the person's computer and sends only what was learned.
 */

import { parseCsv } from "./csv";

export interface ExportRow {
  title: string;
  vendor: string;
  productType: string;
  seoTitle: string;
  price: number | null;
  cost: number | null;
  body: string;
}

/** One row per product (the row that carries the title), with its first variant's price and cost. */
export function exportRows(csv: string): ExportRow[] {
  const grid = parseCsv(csv);
  const header = (grid[0] ?? []).map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);
  const [H, T, V, Y, S, P, C, B] = [at("Handle"), at("Title"), at("Vendor"), at("Type"), at("SEO Title"), at("Variant Price"), at("Cost per item"), at("Body (HTML)")];
  if (H < 0 || T < 0) return [];
  const num = (v: string | undefined) => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return v && Number.isFinite(n) && n > 0 ? n : null; };
  const out: ExportRow[] = [];
  const seen = new Set<string>();
  for (const row of grid.slice(1)) {
    const handle = (row[H] ?? "").trim();
    const title = (row[T] ?? "").trim();
    if (!handle || !title || seen.has(handle)) continue;
    seen.add(handle);
    out.push({ title, vendor: V >= 0 ? (row[V] ?? "").trim() : "", productType: Y >= 0 ? (row[Y] ?? "").trim() : "", seoTitle: S >= 0 ? (row[S] ?? "").trim() : "", price: P >= 0 ? num(row[P]) : null, cost: C >= 0 ? num(row[C]) : null, body: B >= 0 ? (row[B] ?? "") : "" });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The pattern the shop's SEO titles follow, in placeholders — "{title} | {shop}", "{brand} {title}" —
 * where at least seven in ten of the products with one follow it; else "".
 */
export function seoPatternFromRows(rows: ExportRow[], shop: string): string {
  const with_ = rows.filter((r) => r.seoTitle && r.title);
  if (with_.length < 5) return "";
  const patterns = new Map<string, number>();
  for (const r of with_) {
    let p = norm(r.seoTitle);
    const pairs: Array<[string, string]> = [[norm(r.title), "{title}"], [norm(r.vendor), "{brand}"], [norm(r.productType), "{type}"], [norm(shop), "{shop}"]];
    // The longest value first, so a brand inside a title is not taken out of it.
    for (const [value, token] of pairs.sort((a, b) => b[0].length - a[0].length)) if (value && p.includes(value)) p = p.split(value).join(token);
    if (!p.includes("{title}") && !p.includes("{brand}")) continue;
    // The literal parts, once: "{title} | {shop}" and "{title} | {shop} " are one pattern.
    p = p.replace(/\s+/g, " ").trim();
    patterns.set(p, (patterns.get(p) ?? 0) + 1);
  }
  const best = [...patterns.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] / with_.length >= 0.7 ? best[0] : "";
}

export interface BrandMargin {
  brand: string;
  /** Margin on the ex-tax price, as a percentage, the median across the brand's products. */
  marginPct: number;
  products: number;
}

/**
 * Each brand's margin, from the products priced and costed in the export: the median where at least
 * five products agree within ten points of it. Prices are taken as inclusive of the tax rate given.
 */
export function marginsFromRows(rows: ExportRow[], taxRate: number, pricesIncludeTax: boolean): BrandMargin[] {
  const byBrand = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.vendor || r.price === null || r.cost === null) continue;
    const ex = pricesIncludeTax ? r.price / (1 + taxRate) : r.price;
    if (ex <= r.cost) continue;
    const margin = ((ex - r.cost) / ex) * 100;
    byBrand.set(r.vendor, [...(byBrand.get(r.vendor) ?? []), margin]);
  }
  const out: BrandMargin[] = [];
  for (const [brand, margins] of byBrand) {
    if (margins.length < 5) continue;
    const sorted = [...margins].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const agree = sorted.filter((m) => Math.abs(m - median) <= 10).length;
    if (agree / sorted.length < 0.6) continue;
    out.push({ brand, marginPct: Math.round(median), products: margins.length });
  }
  return out.sort((a, b) => b.products - a.products);
}

/** A few of the shop's descriptions, as text, for the writer to learn the shape of: the middling ones by length. */
export function sampleBodies(rows: ExportRow[], n = 6): string[] {
  const bodies = rows.map((r) => r.body.trim()).filter((b) => b.length >= 200 && b.length <= 6000);
  if (bodies.length === 0) return [];
  const sorted = [...new Set(bodies)].sort((a, b) => a.length - b.length);
  const step = Math.max(1, Math.floor(sorted.length / n));
  return sorted.filter((_, i) => i % step === Math.floor(step / 2)).slice(0, n);
}
