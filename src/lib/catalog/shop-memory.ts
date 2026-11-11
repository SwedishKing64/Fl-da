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
import { emptyLineItem, type CanonicalLineItem } from "./types";

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
  /** Every variant's barcode, so an order line can be placed on the listing by its EAN alone. */
  barcodes?: string[];
  /** The options the listing is sold by and every value each takes, for learning which tags mirror them. */
  options?: Array<{ name: string; values: string[] }>;
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
  const B = at("Variant Barcodes") >= 0 ? at("Variant Barcodes") : at("Variant Barcode");
  const bindingAt = [1, 2, 3].map((n) => [at(`Option${n} Name`), at(`Option${n} Value`)] as const);
  if (H < 0 || T < 0) return [];
  const out: Listing[] = [];
  const seen = new Map<string, Listing>();
  // Every row of a product carries its handle and its variant's barcode; the title is on the first.
  for (const row of grid.slice(1)) {
    const handle = (row[H] ?? "").trim();
    if (!handle) continue;
    const code = B >= 0 ? (row[B] ?? "").replace(/^'/, "").trim() : "";
    const had = seen.get(handle);
    if (had) {
      if (code && !had.barcodes!.includes(code)) had.barcodes!.push(code);
      // A later row carries only its variant's values, under the first row's option names.
      for (const [i, [, v]] of bindingAt.entries()) {
        const value = v >= 0 ? (row[v] ?? "").trim() : "";
        const option = had.options?.[i];
        if (option && value && !option.values.includes(value)) option.values.push(value);
      }
      continue;
    }
    const title = (row[T] ?? "").trim();
    if (!title) continue;
    const listing: Listing = {
      handle,
      title,
      vendor: V >= 0 ? (row[V] ?? "").trim() : "",
      productType: Y >= 0 ? (row[Y] ?? "").trim() : "",
      tags: G >= 0 ? (row[G] ?? "").split(",").map((t) => t.trim()).filter(Boolean) : [],
      price: priceOf(C >= 0 ? row[C] : "") ?? priceOf(P >= 0 ? row[P] : ""),
      bindingOption: bindingAt.map(([n, v]) => (n >= 0 && v >= 0 && /^binding option$/i.test((row[n] ?? "").trim()) ? (row[v] ?? "").trim() : "")).find(Boolean) ?? "",
      barcodes: code ? [code] : [],
      options: bindingAt.map(([n, v]) => ({ name: n >= 0 ? (row[n] ?? "").trim() : "", values: v >= 0 && (row[v] ?? "").trim() ? [(row[v] ?? "").trim()] : [] })),
    };
    seen.set(handle, listing);
    out.push(listing);
  }
  for (const l of out) l.options = l.options!.filter((o) => o.name && o.name.toLowerCase() !== "title" && o.values.length);
  return out;
}

/**
 * Which listing each barcode belongs to, where it belongs to exactly one.
 *
 * An EAN is the one key an order line and a listing share by construction: the supplier printed it
 * on the order and the shop typed it into the variant. A barcode on two listings (a package shares
 * its ski's) decides nothing on its own, so neither is returned for it.
 */
export function listingByBarcode(listings: Listing[]): Map<string, Listing> {
  const owners = new Map<string, Listing[]>();
  for (const l of listings) for (const code of l.barcodes ?? []) owners.set(code, [...(owners.get(code) ?? []), l]);
  const out = new Map<string, Listing>();
  for (const [code, ls] of owners) {
    const flat = ls.filter((l) => !isPackageTitle(l.title));
    if (flat.length === 1) out.set(code, flat[0]);
    else if (ls.length === 1) out.set(code, ls[0]);
  }
  return out;
}

/**
 * The shop's own listings of a brand, as a reference sheet an order can be joined to.
 *
 * Burton's SAP export names a boot "M HIGHSHOT SO" and a glove "M GORE GONDY LR GL"; the shop
 * lists them as "Men's Highshot Step On® Snowboard Boots" and "Men's Gondy GORE-TEX Leather
 * Gloves". Without the supplier's description list in the batch there was nothing to join the
 * shorthand to, and every carry-over went out under its shorthand, as a second listing. The shop's
 * catalogue is a reference sheet in all but name: a full name, a vendor, a Type and a price for
 * every model it has sold. One row per listing, under its handle as the code, with the year taken
 * off the name so that last season's listing names this season's product.
 */
export function listingsAsReference(listings: Listing[], brand: string): CanonicalLineItem[] {
  const vendor = brand.trim().toLowerCase();
  if (!vendor) return [];
  // One row per model, the latest listing of it: the shop's "Wheelie Gig Bag" of some years back
  // and its "Wheelie Gig Snowboard Bag 2026" are one model, and the order should land on the latter.
  const byModel = new Map<string, Listing>();
  for (const l of listings) {
    if (l.vendor.trim().toLowerCase() !== vendor || !l.title.trim() || isPackageTitle(l.title)) continue;
    const key = modelKey(l.title, l.vendor).split(" ").filter((w) => !KIND_WORD.test(w) && !AUDIENCE_WORD.test(w)).join(" ") + `|${genderOfListing(l)}`;
    const had = byModel.get(key);
    if (!had || yearOf(l) > yearOf(had)) byModel.set(key, l);
  }
  return [...byModel.values()].map((l) => ({
    ...emptyLineItem(),
    title: l.title.replace(/\s+\b20\d{2}\b\s*$/, "").trim(),
    brand: l.vendor.trim(),
    modelCode: l.handle,
    productType: l.productType,
    rrp: typeof l.price === "number" ? l.price : null,
    gender: genderOfListing(l),
    season: yearOf(l) ? String(yearOf(l)) : "",
  }));
}

/** What kind of thing a listing's title says it is, which an order line leaves out. */
const KIND_WORD = /^(SNOWBOARDS?|SKIS?|BOOTS?|BINDINGS?|GLOVES?|MITTS?|MITTENS?|SOCKS?|BAGS?|JACKETS?|PANTS?|GOGGLES?|HELMETS?|BEANIES?)$/;
const AUDIENCE_WORD = /^(MENS|MEN|WOMENS|WOMEN|KIDS|YOUTH|JUNIOR|JR|UNISEX)$/;

/** Who a listing is for, from its title or its tags. */
function genderOfListing(l: Listing): string {
  const first = l.title.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";
  if (first === "MENS" || first === "MEN") return "MENS";
  if (first === "WOMENS" || first === "WOMEN") return "WOMENS";
  if (["KIDS", "KID", "BOYS", "GIRLS", "YOUTH", "JUNIOR"].includes(first)) return "KIDS";
  const tags = new Set(l.tags.map((t) => t.toLowerCase()));
  if (tags.has("womens") && !tags.has("mens")) return "WOMENS";
  if (tags.has("mens") && !tags.has("womens")) return "MENS";
  if (tags.has("kids") && !tags.has("mens") && !tags.has("womens")) return "KIDS";
  return "";
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
    if (/all[\s-]?mountain|all[\s-]?terrain|frontside|all[\s-]?round/.test(t)) out.push("Frontside & All-Mountain Skis");
    if (/carv|on[\s-]?piste/.test(t)) out.push("Carving Skis");
    if (/freeride|powder|big[\s-]?mountain/.test(t)) out.push("Freeride & Powder Skis");
    if (/freestyle|\bpark\b|twin[\s-]?tip/.test(t)) out.push("Park & Twin Tip Skis");
    if (/\brac(e|ing)\b|world ?cup/.test(t)) out.push("Race Skis");
    if (/mogul/.test(t)) out.push("Mogul Skis");
    if (/touring|skitour|backcountry/.test(t)) out.push("Touring Skis");
    // Nothing said in words: the waist does. The shop files a ski of 100mm and wider under
    // Freeride & Powder and anything narrower under Frontside & All-Mountain (Black Crows'
    // "BIRDIE SKIS" section says only that they are women's).
    const waist = /(\d{2,3})\s*mm waist/.exec(t);
    if (out.length === 0 && waist) out.push(Number(waist[1]) >= 100 ? "Freeride & Powder Skis" : "Frontside & All-Mountain Skis");
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

/**
 * The handle the shop already sells this product under, if it does: same brand, same model, same
 * season, and flat against flat, package against package. Their M7 Mantra 2027 is "m7-mantra" —
 * built as "m7-mantra-2027" and imported, it would have been a second M7 Mantra. Only an answer one
 * listing gives.
 */
export function existingHandle(product: { title: string; brand: string; season: string }, listings: Listing[]): string {
  const key = modelKey(product.title, product.brand);
  if (!key) return "";
  const brand = product.brand.trim().toLowerCase();
  const packaged = isPackageTitle(product.title);
  const season = Number(product.season) || 0;
  const hits = listings.filter((l) =>
    l.vendor.trim().toLowerCase() === brand
    && isPackageTitle(l.title) === packaged
    && modelKey(l.title, l.vendor) === key
    && (season === 0 || yearOf(l) === season));
  return hits.length === 1 ? hits[0].handle : "";
}

/**
 * The Type the shop files this model under, when nothing on the order says what it is: "Blaze 94"
 * and "Revolt 101" carry no word that says ski, and an order form seldom does. Only an answer every
 * listing of the model agrees on.
 */
export function rememberedType(product: { title: string; brand: string }, listings: Listing[]): string {
  const key = modelKey(product.title, product.brand);
  if (!key) return "";
  const brand = product.brand.trim().toLowerCase();
  const types = new Set(listings.filter((l) => l.productType.trim() && l.vendor.trim().toLowerCase() === brand && modelKey(l.title, l.vendor) === key).map((l) => l.productType.trim()));
  return types.size === 1 ? [...types][0] : "";
}
