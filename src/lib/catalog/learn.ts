/**
 * Reading a shop's conventions out of its own Shopify export.
 *
 * A new shop starts blank. What it sells, what it calls each kind of product, which menu tags go
 * with each kind and how each shelf tag is spelled are all in the export it already has, so that is
 * where Flöda learns them. This is the pure half: listings in, a `LearnedVocabulary` out. The
 * templates (per brand and kind) are learned separately by `templates.ts`; the listings themselves
 * are remembered by `shop-memory-store.ts`.
 *
 * What is read:
 *  - Types: every distinct Type, with how many products carry it.
 *  - Spelling: a tag that is the Type's own name, however the shop writes it — "ski tuning",
 *    "back-country-gear" — is that Type's tag.
 *  - Sections: a tag that runs across several kinds of product and sits on nearly every product
 *    of each is a menu ("ski", "outdoor", "clothing"), and the kinds it sits on are filed under it.
 *
 * What is never learned: tags Shopify writes itself, tags staff put on by hand (sales, stocktake),
 * seasons, genders and vendor names. Those are worked out per product by the rules.
 */

import { isShopifyGenerated } from "./generated-tags";
import type { Listing } from "./shop-memory";
import type { LearnedType, LearnedVocabulary } from "./taxonomy";

/** How much of a kind's products a tag must sit on to count as that kind's convention. */
const ON_MOST = 0.7;
/** A menu runs across kinds: it must sit on at least this many distinct Types… */
const SECTION_MIN_TYPES = 2;
/** …and on at least this share of the whole catalogue. */
const SECTION_MIN_SHARE = 0.1;

const norm = (value: string) => value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const slug = (value: string) => value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const AUDIENCE = new Set(["mens", "womens", "kids", "men", "women", "unisex", "youth", "junior"]);
const MANUAL = /^(sale|clearance|scan|superseded|bonus\d+|new|featured|bestseller|best-seller)$|(^|[-\s])(sale|promo|clearance)$/;

/** A tag that says nothing about where a product is filed. */
function ignorable(tag: string, vendors: Set<string>): boolean {
  const value = tag.trim().toLowerCase();
  if (!value) return true;
  if (isShopifyGenerated(value)) return true;
  if (/^(19|20|29)\d{2}$/.test(value)) return true;
  if (AUDIENCE.has(value)) return true;
  if (MANUAL.test(value)) return true;
  if (vendors.has(slug(value))) return true;
  return false;
}

/** Read what an export shows about how the shop files and tags its products. */
export function learnVocabulary(listings: Listing[], file = ""): LearnedVocabulary {
  const clean = listings.filter((l) => l.handle.trim() && l.title.trim());
  const products = clean.length;
  const vendorCounts = new Map<string, number>();
  for (const l of clean) {
    const v = l.vendor.trim();
    if (v) vendorCounts.set(v, (vendorCounts.get(v) ?? 0) + 1);
  }
  const vendorSlugs = new Set([...vendorCounts.keys()].map(slug));

  // Products of each Type, and how often each tag sits on them.
  const byType = new Map<string, { count: number; tags: Map<string, number> }>();
  const tagTypes = new Map<string, Set<string>>();
  const tagTotal = new Map<string, number>();
  for (const l of clean) {
    const type = l.productType.trim();
    if (!type) continue;
    const entry = byType.get(type) ?? { count: 0, tags: new Map() };
    entry.count++;
    const seen = new Set<string>();
    for (const raw of l.tags) {
      const tag = raw.trim().toLowerCase();
      if (!tag || seen.has(tag) || ignorable(tag, vendorSlugs)) continue;
      seen.add(tag);
      entry.tags.set(tag, (entry.tags.get(tag) ?? 0) + 1);
      tagTotal.set(tag, (tagTotal.get(tag) ?? 0) + 1);
      (tagTypes.get(tag) ?? tagTypes.set(tag, new Set()).get(tag)!).add(type);
    }
    byType.set(type, entry);
  }

  // The tag that is a Type's own name is that Type's spelling.
  const spelling: Record<string, string> = {};
  const typeTags = new Set<string>();
  for (const [type, entry] of byType) {
    const want = norm(type);
    const own = [...entry.tags.entries()].filter(([tag]) => norm(tag) === want).sort((a, b) => b[1] - a[1])[0];
    if (own) {
      spelling[type] = own[0];
      typeTags.add(own[0]);
    }
  }
  // Any Type's own tag on another kind's products is a shelf, not a menu.
  for (const type of byType.keys()) typeTags.add(slug(type));

  // A menu: a tag on nearly every product of several kinds, and a fair share of the whole shop.
  const sections: string[] = [];
  for (const [tag, total] of [...tagTotal.entries()].sort((a, b) => b[1] - a[1])) {
    if (typeTags.has(tag) || typeTags.has(slug(tag))) continue;
    if (total / Math.max(products, 1) < SECTION_MIN_SHARE) continue;
    const kinds = [...(tagTypes.get(tag) ?? [])].filter((type) => {
      const entry = byType.get(type)!;
      return (entry.tags.get(tag) ?? 0) / entry.count >= ON_MOST;
    });
    if (kinds.length < SECTION_MIN_TYPES) continue;
    sections.push(tag);
  }

  const types: LearnedType[] = [...byType.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([type, entry]) => ({
      type,
      count: entry.count,
      sections: sections.filter((s) => (entry.tags.get(s) ?? 0) / entry.count >= ON_MOST),
      ...(spelling[type] ? { spelling: spelling[type] } : {}),
    }));

  return {
    types,
    sections,
    spelling,
    vendors: [...vendorCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    products,
    file,
    learnedAt: new Date().toISOString(),
  };
}

/** A few lines saying what was learned, for the screen that shows it. */
export function describeLearned(v: LearnedVocabulary): string[] {
  const lines: string[] = [];
  lines.push(`${v.products.toLocaleString("en-AU")} products from ${v.file || "the export"}, ${v.vendors.length} brand${v.vendors.length === 1 ? "" : "s"}.`);
  lines.push(`${v.types.length} kind${v.types.length === 1 ? "" : "s"} of product${v.types.length ? `: ${v.types.slice(0, 8).map((t) => `${t.type} (${t.count})`).join(", ")}${v.types.length > 8 ? ", …" : ""}` : ""}.`);
  if (v.sections.length) lines.push(`${v.sections.length} menu tag${v.sections.length === 1 ? "" : "s"} that run across kinds: ${v.sections.join(", ")}.`);
  else lines.push("No menu tags found running across product types; each type is tagged on its own.");
  const spelled = Object.keys(v.spelling).length;
  if (spelled) lines.push(`How ${spelled} shelf tag${spelled === 1 ? " is" : "s are"} spelled.`);
  return lines;
}

/**
 * Two exports' readings as one, for a shop that exports a category at a time. A Type in both
 * keeps the larger count and the union of its sections; the file names are joined; a file read
 * again replaces its own earlier contribution to the names, not the counts, which are the
 * best guess either way.
 */
export function mergeVocabulary(before: LearnedVocabulary, next: LearnedVocabulary): LearnedVocabulary {
  const types = new Map<string, LearnedType>();
  for (const t of [...before.types, ...next.types]) {
    const key = norm(t.type);
    const have = types.get(key);
    if (!have) types.set(key, { ...t, sections: [...t.sections] });
    else types.set(key, { type: have.type, count: Math.max(have.count, t.count), sections: [...new Set([...have.sections, ...t.sections])], ...(t.spelling ?? have.spelling ? { spelling: t.spelling ?? have.spelling } : {}) });
  }
  const vendors = new Map<string, number>();
  for (const v of [...before.vendors, ...next.vendors]) vendors.set(v.name, Math.max(vendors.get(v.name) ?? 0, v.count));
  const files = [...new Set([...before.file.split(" + "), ...next.file.split(" + ")].map((f) => f.trim()).filter(Boolean))];
  const sameFile = before.file.split(" + ").map((f) => f.trim()).includes(next.file.trim());
  return {
    types: [...types.values()],
    sections: [...new Set([...before.sections, ...next.sections])],
    spelling: { ...before.spelling, ...next.spelling },
    vendors: [...vendors.entries()].map(([name, count]) => ({ name, count })),
    products: sameFile ? Math.max(before.products, next.products) : before.products + next.products,
    file: files.join(" + "),
    learnedAt: next.learnedAt,
  };
}

/** One kind of product as an export shows it, for the shop to say what it is called, its tags and its titles. */
export interface KindSummary {
  type: string;
  count: number;
  /** Tags on all but the odd one of the type's products, the vendor's own name and Shopify's own tags left out. */
  commonTags: string[];
  /**
   * Tags the type's products carry some of and not others: a ski's terrain, a jacket's gender, the
   * season. Picked for each product by what it is, never put on all of them.
   */
  variesTags: string[];
  /** One real title of the kind, as the shape its titles take. */
  exampleTitle: string;
  vendors: string[];
}

/**
 * How much of a type's products a tag must sit on to be offered as "every one gets it". It was 60%,
 * and a ski shop's terrain and gender tags, each on most but not all of its skis, were offered as
 * tags for every ski. A tag every one gets is on very nearly every one.
 */
const KIND_TAG_SHARE = 0.95;

/** The kinds of product in an export's rows, biggest first, with what their rows have in common. */
export function kindsFromListings(listings: Listing[]): KindSummary[] {
  const vendorSlugs = new Set(listings.map((l) => slug(l.vendor)).filter(Boolean));
  const byType = new Map<string, Listing[]>();
  for (const l of listings) {
    const type = l.productType.trim();
    if (!type) continue;
    const key = norm(type);
    const have = byType.get(key);
    if (have) have.push(l);
    else byType.set(key, [l]);
  }
  const out: KindSummary[] = [];
  for (const rows of byType.values()) {
    const counts = new Map<string, number>();
    for (const l of rows) for (const tag of new Set(l.tags.map((t) => t.trim()).filter(Boolean))) {
      if (ignorable(tag, vendorSlugs)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const commonTags = ranked.filter(([, n]) => n / rows.length >= KIND_TAG_SHARE).map(([tag]) => tag);
    const variesTags = ranked.filter(([, n]) => n >= 2 && n / rows.length < KIND_TAG_SHARE).slice(0, 30).map(([tag]) => tag);
    // The example is a title of middling length: the shortest is often a one-word oddity, the longest a package.
    const titles = rows.map((l) => l.title.trim()).filter(Boolean).sort((a, b) => a.length - b.length);
    out.push({ type: rows[0].productType.trim(), count: rows.length, commonTags, variesTags, exampleTitle: titles[Math.floor(titles.length / 2)] ?? "", vendors: [...new Set(rows.map((l) => l.vendor.trim()).filter(Boolean))] });
  }
  return out.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
