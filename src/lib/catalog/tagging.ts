/**
 * The tags every product carries, in the order the shop writes them.
 *
 * Tags are the most important column: they decide which sub-page a product lands on, which
 * filters find it, and which season it belongs to. Six of them are general — they apply to every
 * product regardless of what it is — and they are built here from the product's own fields rather
 * than written by hand, so they cannot drift between one import and the next.
 *
 * Verified against the shop's 122-product export: every product carries its Type as a slug and its
 * vendor in lower case; the fourteen products with no gender tag are exactly the unisex ones.
 */

import { PRODUCT_TYPES, TYPE_SECTIONS, resolveType } from "./taxonomy";

export type Gender = "mens" | "womens" | "kids";

/**
 * The season tag for something that does not change from year to year. It stands in place of a
 * real season — in the shop's catalogue no product carries both — and whether an item qualifies is
 * a judgement someone makes per product, not a rule about its category: eleven of eighteen
 * snowboard accessories are evergreen, but so are three pairs of boots.
 */
export const EVERGREEN_SEASON = "2999";

export interface TaggingSettings {
  /** The shop's own marker, on every product it builds. */
  houseTag: string;
  /** The season clothing and accessories are currently being tagged with. */
  currentYear: number;
}

export const DEFAULT_TAGGING: TaggingSettings = {
  // The catalogue spells this digits-first on 121 of 122 products.
  houseTag: "123abc-js",
  currentYear: 2026,
};

export interface TagInput {
  type: string;
  vendor: string;
  /**
   * A product that does not change from year to year — a stomp pad, a scraper, replacement
   * hardware. It carries the evergreen marker in place of a season, never as well as one.
   */
  evergreen?: boolean;
  /** Empty for a unisex product — glide wax and stomp pads carry no gender. */
  genders: Gender[];
  /** Which menu this product is being filed under, when its Type sits in more than one. */
  section?: string;
  /** Overrides the season entirely, for old stock or a pre-season buy out of step. */
  year?: number;
}

/**
 * Hardgoods run a season ahead of the rest of the shop: next winter's boards, skis, boots and
 * bindings are bought and tagged while this winter's clothing is still current.
 *
 * What decides it is the noun being sold, not whether the word "ski" appears anywhere — "Ski
 * Poles" and "Snowboard Bags" are accessories that happen to be named after the sport. And the
 * rule is confined to the Ski and Snowboard menus, so Outdoor's hiking and apres boots stay on
 * the current season.
 */
const HARDGOOD_NOUNS = new Set(["snowboards", "skis", "boards", "boots", "bindings", "packages"]);

export function isHardgood(type: string): boolean {
  const resolved = resolveType(type) ?? type.trim();
  const sections = TYPE_SECTIONS[resolved] ?? [];
  if (!sections.some((s) => s === "Ski" || s === "Snowboard")) return false;
  const lastWord = resolved.toLowerCase().split(/[^a-z]+/).filter(Boolean).pop() ?? "";
  return HARDGOOD_NOUNS.has(lastWord);
}

/** The season a product should be tagged with. */
export function seasonFor(type: string, settings: TaggingSettings = DEFAULT_TAGGING): number {
  return isHardgood(type) ? settings.currentYear + 1 : settings.currentYear;
}

/**
 * Tags whose live spelling is not the slug of their name. Empty by design: the shop has settled on
 * hyphens everywhere, so "Snow Jackets" is written snow-jackets. Kept as the one place to pin an
 * exception if some page ever turns out to filter on a different string.
 */
export const TAG_SPELLING: Record<string, string> = {};

/**
 * Tags Shopify writes by itself — price bands, sizes and colours are derived from the variants
 * once a product is in the store.
 *
 * These matter twice over. The importer must not write them, or it would fight Shopify over the
 * same tag. And the template learner must not *read* them either: a brand export is full of
 * colour-true-black and size-medium, and without this a template would learn those as house
 * conventions and stamp one brand's colours onto every new product.
 */
const SHOPIFY_GENERATED: RegExp[] = [
  /^\d+-\d+$/, // price band, e.g. 500-600
  /^under-\d+$/, // e.g. under-50
  /^size-/i,
  /^colou?r-/i,
];

export function isShopifyGenerated(tag: string): boolean {
  const value = tag.trim();
  return SHOPIFY_GENERATED.some((pattern) => pattern.test(value));
}

/** Drop anything Shopify maintains for itself. */
export function withoutGenerated(tags: string[]): string[] {
  return tags.filter((tag) => !isShopifyGenerated(tag));
}

/**
 * Tags a person puts on by hand: promotions, sale events, and stocktake markers.
 *
 * These are decisions about one product at one moment, not conventions, so the importer never
 * writes them and the template learner never reads them. An export taken during a sale is full of
 * "clearance" and "snow sale", and learning those would have every new full-price product born on
 * markdown. Campaign codes are matched by shape — bonus10 today, bonus15 next month.
 */
const MANUAL_TAGS = new Set(["snow-sale", "snow-clearance", "clearance", "sale", "scan", EVERGREEN_SEASON]);
const MANUAL_PATTERNS: RegExp[] = [/^bonus\d+$/i];

export function isManualTag(tag: string): boolean {
  const value = slugTag(tag);
  return MANUAL_TAGS.has(value) || MANUAL_PATTERNS.some((p) => p.test(value));
}

/**
 * Everything the importer must neither write nor learn: Shopify's own derived tags, and the ones
 * staff apply by hand. Tags already on a product are left alone — a person put them there.
 */
export function isNotOurs(tag: string): boolean {
  return isShopifyGenerated(tag) || isManualTag(tag);
}

export const slugTag = (value: string): string =>
  value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The general tags, in the shop's order: type, section, season, house marker, vendor, then gender.
 * Order is preserved because it is the order a person reads them in when checking a product.
 */
export function generalTags(input: TagInput, settings: TaggingSettings = DEFAULT_TAGGING): string[] {
  const tags: string[] = [];
  const push = (value: string) => {
    const tag = value.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  };

  const type = resolveType(input.type) ?? input.type.trim();
  if (type) push(TAG_SPELLING[type] ?? slugTag(type));

  // A Type can sit under two menus — Goggles under both Ski and Snowboard — so an explicit
  // section wins, and a Type that belongs to exactly one menu needs no help.
  const sections = TYPE_SECTIONS[type] ?? [];
  const section = input.section?.trim() || (sections.length === 1 ? sections[0] : "");
  if (section) push(slugTag(section));

  push(input.evergreen ? EVERGREEN_SEASON : String(input.year ?? seasonFor(type, settings)));
  push(settings.houseTag);
  push(slugTag(input.vendor));
  for (const gender of normaliseGenders(input.genders)) push(gender);

  return tags;
}

/**
 * A kids product is tagged kids and nothing else. The catalogue never pairs kids with mens or
 * womens — a child's jacket is not a small men's jacket, it is its own thing with its own page.
 */
export function normaliseGenders(genders: Gender[]): Gender[] {
  const unique = [...new Set(genders)];
  return unique.includes("kids") ? ["kids"] : unique;
}

/** Which menus a Type could be filed under, for asking a person when it is genuinely ambiguous. */
export function candidateSections(type: string): string[] {
  return TYPE_SECTIONS[resolveType(type) ?? type] ?? [];
}

/** True when a Type sits in more than one menu, so the section tag cannot be inferred. */
export function needsSectionChoice(type: string): boolean {
  return candidateSections(type).length > 1;
}

export const KNOWN_TYPES = PRODUCT_TYPES;
