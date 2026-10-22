/**
 * The vocabulary of product Types, and where each one lives on the shop's site.
 *
 * Nothing about one shop is fixed here. The vocabulary in force is built from two things: a
 * *rules pack* the shop switched on (the snow-and-outdoor menu below, transcribed from the ski
 * shop Flöda was built in, or nothing at all) and what was *learned* from the shop's own Shopify
 * export — its Types, which menu tags go with each, and how each shelf tag is spelled. See
 * `activateConventions` at the foot of the file; `shop-profile.ts` loads the shop's choice and
 * calls it once per request.
 *
 * The rest of this header describes the snow-and-outdoor menu, since the same reading applies to
 * any menu a shop has.
 *
 * The Shopify `Type` column holds the most specific thing the product *is*: "Snowboard Boots",
 * "Synthetic Sleeping Bags". The drop-down menu it sits under — Clothing, Ski, Snowboard,
 * Backcountry, Outdoor — is a tag, not a Type.
 *
 * That leaves one distinction to draw, and the menu draws it for us. A sub-link that splits a
 * range by **who it is for** ("Mens Boots", "Womens Boots", "Kids Boots") is not a different kind
 * of product, so the Type stays the heading above it and the audience becomes a tag. A sub-link
 * that splits by **what the product is** ("Down Sleeping Bags" vs "Synthetic Sleeping Bags") is a
 * different kind of product, so the sub-link itself is the Type.
 *
 * Transcribed from the live menus. Treat this file as the vocabulary: a Type that is not in it is
 * a Type that has nowhere to live on the website.
 */

import { packFor, type PackId } from "./trades";
import type { PackKnowledge } from "./trades/knowledge";
import { setTradeColours } from "./colour";
import { DEFAULT_HOUSE, type HouseConventions } from "./house";
import type { WebsiteCategories } from "./website";
import { categoryById, resolveCategory, type TaxonomyCategory } from "./shopify-taxonomy";
import { CANONICAL_FIELDS, type CanonicalFieldDef, type MetafieldDef } from "./types";

export interface TaxonomyGroup {
  /** The bold heading. This is the value written to the Shopify `Type` column. */
  heading: string;
  /** The links under it — where a product actually lands once tags are applied. */
  leaves: string[];
}

export interface TaxonomySection {
  /** The top-level menu item: Clothing, Ski, Snowboard, Backcountry, Outdoor. */
  top: string;
  groups: TaxonomyGroup[];
}

export { SNOW_OUTDOOR_TAXONOMY } from "./trades/snow-outdoor";

/** Top-level menu entries that hold no product types — they are merchandising, not categories. */
export const NON_TYPE_MENUS = ["Brands", "Clearance", "Rentals", "Gift Cards"] as const;

/** A sub-link that names an audience rather than a kind of product. These become tags, not Types. */
const AUDIENCE_LEAF = /^(mens|womens|women's|mens'|kids|kids'|youth|unisex)\b/i;

export function isAudienceLeaf(leaf: string): boolean {
  return AUDIENCE_LEAF.test(leaf.trim());
}

/**
 * Headings the catalogue files products directly under, keeping the heading as the Type and letting
 * the shelf ride along as a tag.
 *
 * Everywhere else the Type is the most specific thing a product is. These are the exceptions: a
 * glove is filed as "Ski Accessories" with ski-gloves as a tag, and an avalanche probe as
 * "Back-Country Gear" with beacons-and-probes as a tag. Both are what the shop's own exports do.
 */
const HEADING_TYPES = new Set(["Backcountry Gear"]);

export function isAccessoryHeading(heading: string): boolean {
  const value = heading.trim();
  return /\bAccessories$/i.test(value) || HEADING_TYPES.has(value);
}

/**
 * Clothing headings that group by who wears it rather than what the garment is for. A jacket sits
 * under Mens Clothing and under Snow Clothing; only the second says anything about the product, and
 * only the second is ever written — all seventy of the shop's snow garments are typed Snow Clothing.
 */
const AUDIENCE_HEADINGS = new Set(["Mens Clothing", "Womens Clothing", "Kids Clothing"]);

// ---------------------------------------------------------------------------------------------
// The vocabulary in force
// ---------------------------------------------------------------------------------------------

/** A Type learned from the shop's own export, with what the export showed about it. */
export interface LearnedType {
  type: string;
  /** How many products carried it. */
  count: number;
  /** The menu tags its products carry (the shop's own, as written): where it is filed. */
  sections: string[];
  /** The tag the shop writes for the Type itself, where one was found. */
  spelling?: string;
}

/** Everything learned from one Shopify export about how the shop files and tags its products. */
export interface LearnedVocabulary {
  types: LearnedType[];
  /** The menu tags, as written, that run across several Types. */
  sections: string[];
  /** Type or section name → the tag the shop writes for it. */
  spelling: Record<string, string>;
  vendors: Array<{ name: string; count: number }>;
  products: number;
  file: string;
  learnedAt: string;
}

/** Which trade packs are on: one id, several joined by "+", or "general" for none. See trades/. */
export type RulesPack = PackId | (string & {});

/** What decides the vocabulary: the pack, what was learned, and the shop's marker tag. */
export interface Conventions {
  pack: RulesPack;
  learned: LearnedVocabulary | null;
  /**
   * The fixed half of a marker tag written on everything built here, with the builder's initials
   * on the end ("123abc-zb"). Empty means the shop writes no marker.
   */
  marker: string;
  /** How the shop writes a listing — names, SKUs and barcodes, weights (see house.ts). */
  house?: HouseConventions;
  /** The categories read off the shop's own website: each one is a kind of product (see website.ts). */
  website?: WebsiteCategories | null;
}

interface Vocabulary {
  tree: TaxonomySection[];
  productTypes: string[];
  typeSections: Record<string, string[]>;
  typeParents: Record<string, string[]>;
  typeLeaves: Record<string, string[]>;
  spelling: Record<string, string>;
  also: Record<string, readonly string[]>;
  sections: string[];
}

/** Blank: no pack, nothing learned, no marker. What a fresh install runs on until setup. */
export const BLANK_CONVENTIONS: Conventions = { pack: "general", learned: null, marker: "", house: DEFAULT_HOUSE };

/** The conventions of the shop Flöda was built in; the tests are written against them. */
export const ALPSPORT_CONVENTIONS: Conventions = { pack: "snow-outdoor", learned: null, marker: "123abc", house: DEFAULT_HOUSE };

/**
 * The menu draws an ampersand and the catalogue spells it out, so the two have to meet: without
 * this, the shop's own Type values — "Packs and Bags", "Climbing and Abseiling" — fail to resolve
 * back to the menu headings they came from, and a product re-read from an export loses its place.
 */
const norm = (value: string) => value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

function fromTree(tree: TaxonomySection[]): Pick<Vocabulary, "productTypes" | "typeSections" | "typeParents" | "typeLeaves" | "sections"> {
  const productTypes: string[] = [];
  const sections: Record<string, Set<string>> = {};
  const parents: Record<string, Set<string>> = {};
  const addSection = (type: string, top: string) => { (sections[type] ??= new Set()).add(top); };
  for (const section of tree) {
    for (const group of section.groups) {
      // Every heading is a Type: all 673 typed products in the shop's exports carry one. The
      // sub-links stay resolvable too, since an invoice names them freely — they are mapped up to
      // the heading they sit under rather than written to the column.
      if (!AUDIENCE_HEADINGS.has(group.heading)) {
        if (!productTypes.includes(group.heading)) productTypes.push(group.heading);
        addSection(group.heading, section.top);
      }
      for (const leaf of group.leaves) {
        if (isAudienceLeaf(leaf)) continue;
        if (!productTypes.includes(leaf)) productTypes.push(leaf);
        addSection(leaf, section.top);
        (parents[leaf] ??= new Set()).add(group.heading);
      }
    }
  }
  return {
    productTypes,
    typeSections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, [...v]])),
    typeParents: Object.fromEntries(Object.entries(parents).map(([k, v]) => [k, [...v]])),
    typeLeaves: Object.fromEntries(tree.flatMap((s) => s.groups.map((g) => [g.heading, g.leaves] as const))),
    sections: tree.map((s) => s.top),
  };
}

function build(conventions: Conventions): Vocabulary {
  // What the trade pack brings: its menu, its tag spellings. The engine knows no trade of its own.
  const pack = packFor(conventions.pack);
  const tree = pack.tree;
  const base = fromTree(tree);
  const spelling: Record<string, string> = { ...pack.tagSpelling };
  const also: Record<string, readonly string[]> = { ...pack.tagAlso };
  const sections = [...base.sections];
  const learned = conventions.learned;
  if (learned) {
    const known = (value: string) => base.productTypes.find((t) => norm(t) === norm(value));
    for (const section of learned.sections) if (!sections.some((s) => norm(s) === norm(section))) sections.push(section);
    for (const entry of learned.types) {
      const type = entry.type.trim();
      if (!type) continue;
      const existing = known(type);
      if (!existing) {
        // A Type the pack does not know is a heading of its own, filed where the export files it.
        base.productTypes.push(type);
        base.typeLeaves[type] = [];
        if (entry.sections.length) base.typeSections[type] = [...entry.sections];
      } else if (entry.sections.length && !base.typeSections[existing]?.length) {
        base.typeSections[existing] = [...entry.sections];
      }
      if (entry.spelling) spelling[existing ?? type] = entry.spelling;
    }
    for (const [name, tag] of Object.entries(learned.spelling)) {
      if (!tag) continue;
      spelling[known(name) ?? name] = tag;
    }
    // A learned section's own name is the tag the shop writes, however it is spelled.
    for (const section of learned.sections) spelling[section] ??= section;
  }
  // Every category on the shop's website is a place a product can be filed, so each is a Type.
  // One the pack or the export already knows is left as it was; the rest are headings of their own.
  for (const category of conventions.website?.categories ?? []) {
    const type = category.title.trim();
    if (!type || base.productTypes.some((t) => norm(t) === norm(type))) continue;
    base.productTypes.push(type);
    base.typeLeaves[type] = [];
  }
  return { tree, ...base, spelling, also, sections };
}

let conventions: Conventions = BLANK_CONVENTIONS;
let active: Vocabulary = build(conventions);

/**
 * Put a shop's conventions in force for this process. Called by `shop-profile.ts` with what the
 * shop chose and learned, and by tests with `ALPSPORT_CONVENTIONS`. The vocabulary is process-wide:
 * Flöda runs one shop per install.
 */
export function activateConventions(next: Conventions): void {
  conventions = next;
  active = build(next);
  setTradeColours(packFor(next.pack).knowledge?.colours ?? {});
}

/** What the shop's trade pack knows beyond its menu: kinds, sizes, colour shorthand. None for most packs. */
export function packKnowledge(): PackKnowledge | null {
  return packFor(conventions.pack).knowledge ?? null;
}

export function activeConventions(): Conventions {
  return conventions;
}

/** The fields that are a ski's alone: offered to a column, and asked of the reader, only in the snow trade. */
export const SNOW_FIELDS = new Set<string>(["flex", "abilityLevel", "dinRange", "terrain"]);

/** The fields a supplier's column can be mapped to in this shop. Elsewhere a ski's columns are kept as traits. */
export function fieldsInForce(): CanonicalFieldDef[] {
  return snowTrade() ? CANONICAL_FIELDS : CANONICAL_FIELDS.filter((f) => !SNOW_FIELDS.has(f.key));
}

/**
 * A kind of product's place in Shopify's Standard Product Taxonomy: as the pack places it, or its
 * heading as the pack places that, or — for a kind the shop taught Flöda — found by name, where the
 * name says plainly what it is. Null where none of these says: no category beats the wrong one.
 */
export function categoryForKind(kind: string): TaxonomyCategory | null {
  const placed = packFor(conventions.pack).shopifyCategories;
  const name = resolveType(kind) ?? kind;
  const id = placed[name] ?? (active.typeParents[name] ?? []).map((h) => placed[h]).find(Boolean);
  if (id) return categoryById(id);
  return resolveCategory(name, (active.typeSections[name] ?? []).join(" "));
}

/** Whether every product goes out with its Shopify category filled in. See TradePack.fillsCategory. */
export function fillsCategory(): boolean {
  return packFor(conventions.pack).fillsCategory;
}

/** The product metafields this shop writes, from its pack. See types.ts. */
export function metafieldDefs(): MetafieldDef[] {
  return packFor(conventions.pack).metafields;
}

/**
 * True where the ski and snowboard rules apply: the shop started from the snow pack, or its own
 * store or exports have taught Flöda that it sells skis or snowboards.
 */
export function snowTrade(): boolean {
  return packFor(conventions.pack).snowRules || active.productTypes.some((t) => /\b(skis?|snowboards?)\b/i.test(t));
}

/** True once the shop has told Flöda its kinds of product, from its website or its export, so a Type can be checked against them. */
export function typesAreKnown(): boolean {
  return active.productTypes.length > 0;
}

/** The menu tree in force: the snow-and-outdoor menu, or nothing. */
export function activeTree(): TaxonomySection[] {
  return active.tree;
}

/**
 * Every valid value for the Shopify `Type` column.
 *
 * A group whose sub-links only split by audience contributes its heading ("Snowboard Boots"), and
 * so does an accessories heading. Every sub-link that names a kind of product contributes itself
 * ("Synthetic Sleeping Bags"). A Type learned from the shop's export is added as a heading.
 */
export function productTypes(): string[] {
  return active.productTypes;
}

/** Type → the top-level menus it can appear under. This is what gets written as a tag. */
export function typeSections(): Record<string, string[]> {
  return active.typeSections;
}

/** Type → the group headings it sits beneath, for showing a person where a match landed. */
export function typeParents(): Record<string, string[]> {
  return active.typeParents;
}

/** heading → its sub-links, kept whole so the UI can show what sits under a group. */
export function typeLeaves(): Record<string, string[]> {
  return active.typeLeaves;
}

/** The top-level menus in force, in order: the pack's, then the learned ones. */
export function sectionNames(): string[] {
  return active.sections;
}

/** Type or section → the tag the shop writes for it, where that is not the plain slug. */
export function tagSpelling(): Record<string, string> {
  return active.spelling;
}

/** Type → the further tags it carries beside its own. */
export function tagAlso(): Record<string, readonly string[]> {
  return active.also;
}

/** The fixed half of the shop's marker tag; empty when the shop writes none. */
/** How the shop writes a listing, as last put in force. */
export function houseConventions(): HouseConventions {
  return conventions.house ?? DEFAULT_HOUSE;
}

export function markerPrefix(): string {
  return conventions.marker.trim().toLowerCase();
}

/**
 * The two clothing headings that say what a garment is *for* rather than who wears it. A snow
 * jacket sits under Snow Clothing, a hiking sock under Outdoor Clothing, and the catalogue tags
 * the heading alongside the garment — Burton's snow jackets all carry snow-clothing.
 *
 * The menu settles this for all but one garment: Midlayers appears under both.
 */
export const CLOTHING_CONTEXTS = ["Snow Clothing", "Outdoor Clothing"] as const;

/** The context headings a garment sits under. Empty for one the menu does not place. */
export function clothingContextsFor(type: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const clothing = active.tree.find((s) => s.top === "Clothing");
  if (!clothing) return [];
  return clothing.groups
    .filter((g) => (CLOTHING_CONTEXTS as readonly string[]).includes(g.heading) && g.leaves.includes(resolved))
    .map((g) => g.heading);
}

/**
 * The heading a product is filed under — which is what the Shopify `Type` column holds.
 *
 * Every one of the 673 typed products in the shop's exports carries a heading there and not one
 * carries a sub-link: a Nemo tent is typed Tents with "2 person tents" as a tag, a One Planet bag is
 * typed Sleeping Bags with "down sleeping bags" as a tag. So the sub-link a product is written
 * against is resolved up to the heading it sits beneath, and rides along as a tag.
 *
 * More than one comes back where the menu genuinely files a product in two places — Climbing Shoes
 * sits under Climbing & Abseiling and under Footwear — and then a person decides.
 */
export function headingsFor(type: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  if (active.typeLeaves[resolved]) return [resolved]; // it is already a heading
  const parents = (active.typeParents[resolved] ?? []).filter((h) => !AUDIENCE_HEADINGS.has(h));
  return order(parents);
}

/**
 * Where a shelf that hangs in two places is actually filed.
 *
 * The menu lists Goggles, Helmets and Gloves under both Ski Accessories and Snowboard Accessories,
 * and the shop does not use it that way. In their own exports:
 *
 *   goggles        27 of 27 typed Ski Accessories
 *   snow helmets   10 of 10 typed Ski Accessories (the others are climbing helmets)
 *   gloves        127 of 129 typed Ski Accessories
 *
 * Snowboard Accessories is a real heading with 37 products on it, but they are snowboard hardware
 * — stomp pads, leashes, tuning — not the things anyone wears on their head or hands. An Oakley
 * helmet went out typed Snowboard Accessories because "Helmets" hangs only under that heading in
 * the menu, while the shop's own word for it is "Ski Helmets". So where a shelf sits under both,
 * the one the shop uses wins, and a person can still change it on the review page.
 */
function order(headings: string[]): string[] {
  if (headings.length < 2) return headings;
  const ski = headings.indexOf("Ski Accessories");
  const board = headings.indexOf("Snowboard Accessories");
  if (ski === -1 || board === -1) return headings;
  return [headings[ski], ...headings.filter((_, i) => i !== ski)];
}

/**
 * Spellings that appear in the existing catalogue but not in the menu. The site hyphenates
 * "Back-Country" in one place and not another, so both have to resolve.
 */
const ALIASES: Record<string, string> = {
  "back country gear": "Backcountry Gear",
  "backcountry gear": "Backcountry Gear",
  "snowboard boot": "Snowboard Boots",
  "ski boot": "Ski Boots",
};

/** Resolve a written type to the exact menu heading, or undefined when it is not in the menu. */
export function resolveType(value: string): string | undefined {
  const want = norm(value);
  if (!want) return undefined;
  const exact = active.productTypes.find((t) => norm(t) === want);
  if (exact) return exact;
  const alias = ALIASES[want];
  if (alias && active.productTypes.includes(alias)) return alias;
  // What the trade's suppliers call a kind: "FS" is a full-suspension mountain bike, "TLR" a tyre.
  const called = packKnowledge()?.kinds.find((k) => k.supplierWords.some((w) => norm(w) === want));
  return called ? active.productTypes.find((t) => norm(t) === norm(called.kind)) : undefined;
}

/** True when this names a place a product can legitimately be filed. */
export function isValidType(value: string): boolean {
  return resolveType(value) !== undefined;
}
