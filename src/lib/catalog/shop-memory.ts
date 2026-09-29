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
  /** The listing's recommended retail as the shop writes it: Compare At where set, else Price. */
  price?: number | null;
  /** A package's binding, as its Binding Option reads: "Marker Squire - Black". */
  bindingOption?: string;
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
  const [P, C] = [at("Variant Price"), at("Variant Compare At Price")];
  const bindingAt = [1, 2, 3].map((n) => [at(`Option${n} Name`), at(`Option${n} Value`)] as const);
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
      price: priceOf(C >= 0 ? row[C] : "") ?? priceOf(P >= 0 ? row[P] : ""),
      bindingOption: bindingAt.map(([n, v]) => (n >= 0 && v >= 0 && /^binding option$/i.test((row[n] ?? "").trim()) ? (row[v] ?? "").trim() : "")).find(Boolean) ?? "",
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

function priceOf(raw: string | undefined): number | null {
  const n = Number((raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A supplier's recommended retail, ending the way the shop ends this brand's prices.
 *
 * Völkl's form says 1649; the shop lists the M7 Mantra at 1649.99, and 104 of its 107 Völkl prices
 * end in .99. Written as 1649 it would have cut every carry-over's Compare At by 99 cents and put
 * every new ski a cent off its siblings. Other brands are the other way — most Rossignol and Black
 * Crows prices are whole dollars — so it is read per brand, and only a clear majority decides.
 */
export function asShopPrice(rrp: number | null, vendor: string, listings: Listing[]): number | null {
  if (rrp === null || !Number.isInteger(rrp)) return rrp;
  const brand = vendor.trim().toLowerCase();
  const prices = listings.filter((l) => l.vendor.trim().toLowerCase() === brand && typeof l.price === "number").map((l) => l.price as number);
  if (prices.length < 3) return rrp;
  const cents99 = prices.filter((p) => Math.round(p * 100) % 100 === 99).length;
  return cents99 / prices.length >= 0.7 ? Math.round((rrp + 0.99) * 100) / 100 : rrp;
}

/**
 * The binding the shop packaged this model with last time, as its Binding Option reads.
 *
 * Their Mantra Junior 2025 package is "Marker Squire - Black"; a kids' ski takes whatever junior
 * binding the shop chose for it, and that choice is only written down in its previous package.
 */
export function rememberedBinding(product: { title: string; brand: string }, listings: Listing[]): string {
  const key = modelKey(product.title, product.brand);
  const brand = product.brand.trim().toLowerCase();
  const same = listings.filter((l) => l.bindingOption && l.vendor.trim().toLowerCase() === brand && modelKey(l.title, l.vendor) === key);
  if (same.length === 0) return "";
  return same.reduce((a, b) => (yearOf(b) > yearOf(a) ? b : a)).bindingOption ?? "";
}

/**
 * The vendor the shop already sells a model under, when the order does not say: every listing of
 * "M7 Mantra", whatever the year, is Volkl. Only an answer all its listings agree on.
 */
export function rememberedVendor(title: string, listings: Listing[]): string {
  const key = modelKey(title);
  if (!key) return "";
  const vendors = new Set(listings.filter((l) => l.vendor.trim() && modelKey(l.title, l.vendor) === key).map((l) => l.vendor.trim()));
  return vendors.size === 1 ? [...vendors][0] : "";
}
