/**
 * What the shop has already decided about a model, remembered from its own listings.
 *
 * Some of a listing is the supplier's to say — the name, the price, the barcode — and some is only
 * ever the shop's: which riding-style shelves a model sits on. Volkl calls the Revolt 101
 * "Freestyle"; the shop files it under freeride and powder AND park and twin tip. Burton's copy never
 * says "park" at all; the shop's Custom has sat on the park shelf every season. No reading of a
 * supplier's file can know that, and a new season's Custom built without it lost the tags its
 * predecessor had.
 *
 * So the shop's previous listing of the same model — same brand, same name once the year is taken
 * off — is where those tags come from, and a supplier's own category ("ALL MOUNTAIN", "Freeride")
 * only speaks for a model the shop has never listed.
 *
 * Pure: the listings are handed in, from the export loaded on the page or from the ones stored.
 */

import { parseCsv } from "./csv";
import { BOARD_DISCIPLINES, SKI_DISCIPLINES, TOURING_SKI_TAG, tagsFor } from "./tagging";

export interface Listing {
  handle: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
}

/** Every riding-style tag the shop uses, board and ski. */
const DISCIPLINE_TAGS = new Set([...BOARD_DISCIPLINES, ...SKI_DISCIPLINES].flatMap((d) => tagsFor(d)).concat(TOURING_SKI_TAG).map((t) => t.toLowerCase()));

export const isDisciplineTag = (tag: string): boolean => DISCIPLINE_TAGS.has(tag.trim().toLowerCase());

/** A package is a ski or board with something else on it; its shelves are not the flat model's. */
const isPackageTitle = (title: string): boolean => /\binc\b|\bpackage\b|\bsystem\b/i.test(title);

/**
 * The model a title names, for comparing across seasons: "Custom 2027" and "Custom 2026" are one
 * model, "Custom X 2027" is another. The year, the brand and any "inc …" tail are taken off.
 */
export function modelKey(title: string, vendor = ""): string {
  let words = title.toUpperCase().replace(/['’]/g, "").replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const inc = words.indexOf("INC");
  if (inc > 0) words = words.slice(0, inc);
  const brand = vendor.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  if (brand.length > 0 && brand.every((w, i) => words[i] === w)) words = words.slice(brand.length);
  return words.filter((w) => !/^(19|20)\d\d$/.test(w)).join(" ");
}

const yearOf = (listing: Listing): number => {
  const years = [listing.title, ...listing.tags].join(" ").match(/\b20\d\d\b/g) ?? [];
  return years.length ? Math.max(...years.map(Number)) : 0;
};

/** One listing per product from a Shopify export: the row that carries the title. */
export function listingsFromCsv(csv: string): Listing[] {
  const grid = parseCsv(csv);
  const header = grid[0] ?? [];
  const at = (name: string) => header.indexOf(name);
  const [H, T, V, Y, G] = [at("Handle"), at("Title"), at("Vendor"), at("Type"), at("Tags")];
  if (H < 0 || T < 0) return [];
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const row of grid.slice(1)) {
    const handle = (row[H] ?? "").trim();
    const title = (row[T] ?? "").trim();
    if (!handle || !title || seen.has(handle)) continue;
    seen.add(handle);
    out.push({
      handle,
      title,
      vendor: V >= 0 ? (row[V] ?? "").trim() : "",
      productType: Y >= 0 ? (row[Y] ?? "").trim() : "",
      tags: G >= 0 ? (row[G] ?? "").split(",").map((t) => t.trim()).filter(Boolean) : [],
    });
  }
  return out;
}

/**
 * The riding-style tags the shop gave this model last time, or none.
 *
 * The most recent listing of the same brand and model wins, flat against flat and package against
 * package. Nothing is taken from a listing of another brand, however alike the names.
 */
export function rememberedDisciplines(product: { title: string; brand: string }, listings: Listing[]): string[] {
  const key = modelKey(product.title, product.brand);
  if (!key) return [];
  const brand = product.brand.trim().toLowerCase();
  const packaged = isPackageTitle(product.title);
  const same = listings.filter((l) =>
    l.vendor.trim().toLowerCase() === brand
    && isPackageTitle(l.title) === packaged
    && modelKey(l.title, l.vendor) === key
    && l.tags.some(isDisciplineTag));
  if (same.length === 0) return [];
  const latest = same.reduce((a, b) => (yearOf(b) > yearOf(a) ? b : a));
  return latest.tags.filter(isDisciplineTag).map((t) => t.toLowerCase());
}

/** A cell that names a riding style and nothing else: "ALL MOUNTAIN", "Freeride", "Park / Freestyle". */
export const TERRAIN_VALUE = /^(all[\s-]?mountain|freestyle|freeride|park|powder|big[\s-]?mountain|backcountry|frontside|carving|race|racing|touring|all[\s-]?round|piste|mogul|twin[\s-]?tip|jib)(\s*[/&,]\s*(all[\s-]?mountain|freestyle|freeride|park|powder|backcountry|frontside|carving|touring))*$/i;

/** The column whose values are mostly riding styles, if there is one. */
export function terrainColumn(headers: string[], valueOf: (header: string) => string[]): string | null {
  for (const h of headers) {
    const values = valueOf(h).map((v) => v.trim()).filter(Boolean);
    if (values.length > 0 && values.filter((v) => TERRAIN_VALUE.test(v)).length / values.length >= 0.7) return h;
  }
  return null;
}

/**
 * A supplier's own word for the riding style, as the shop's shelf.
 *
 * Burton's order form carries it as "ALL MOUNTAIN" in a PH3 column; Volkl's PIM as "Freeride" or
 * "Freestyle" under category. Only the words that mean one shelf unambiguously are read.
 */
export function disciplinesFromTerrain(productType: string, text: string): string[] {
  const t = text.toLowerCase();
  if (!t.trim()) return [];
  const board = /snowboard/i.test(productType);
  const ski = !board && /\bskis?\b/i.test(productType);
  const out: string[] = [];
  if (board) {
    if (/all[\s-]?mountain|freestyle/.test(t)) out.push("Freestyle & All-Mountain Boards");
    if (/\bpark\b|\bjib|\bpipe\b/.test(t)) out.push("Park Boards");
    if (/freeride|powder|big[\s-]?mountain|backcountry/.test(t)) out.push("Freeride & Powder Boards");
  } else if (ski) {
    if (/all[\s-]?mountain|frontside|all[\s-]?round/.test(t)) out.push("Frontside & All-Mountain Skis");
    if (/carv|on[\s-]?piste/.test(t)) out.push("Carving Skis");
    if (/freeride|powder|big[\s-]?mountain/.test(t)) out.push("Freeride & Powder Skis");
    if (/freestyle|\bpark\b|twin[\s-]?tip/.test(t)) out.push("Park & Twin Tip Skis");
    if (/\brac(e|ing)\b|world ?cup/.test(t)) out.push("Race Skis");
    if (/mogul/.test(t)) out.push("Mogul Skis");
    if (/touring|skitour|backcountry/.test(t)) out.push("Touring Skis");
  }
  return out.flatMap((d) => tagsFor(d).slice(0, 1));
}
