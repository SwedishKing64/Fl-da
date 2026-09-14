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

import { ALPSPORT_TAXONOMY, PRODUCT_TYPES, TYPE_SECTIONS, resolveType } from "./taxonomy";
import { classifyBinding, classifySnowboardBinding, type BindingKind } from "./bindings";
import { classifySkiBoot, classifySnowboardBoot } from "./boots";
import { accessoryKind } from "./accessories";

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

/** The ski disciplines a product can be filed under. A ski may be several at once. */
export const SKI_DISCIPLINES: string[] =
  ALPSPORT_TAXONOMY.find((s) => s.top === "Ski")?.groups.find((g) => g.heading === "Ski Categories")?.leaves ?? [];

/** The snowboard equivalents. */
export const BOARD_DISCIPLINES: string[] =
  ALPSPORT_TAXONOMY.find((s) => s.top === "Snowboard")?.groups.find((g) => g.heading === "Snowboard Categories")?.leaves ?? [];

/** Which disciplines are open to a product, given what it is. Empty for anything but a ski or board. */
export function disciplinesFor(type: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const sections = TYPE_SECTIONS[resolved] ?? [];
  if (/\bskis?\b/i.test(resolved) || sections.includes("Ski")) {
    if (/snowboard/i.test(resolved)) return BOARD_DISCIPLINES;
    return SKI_DISCIPLINES;
  }
  if (sections.includes("Snowboard")) return BOARD_DISCIPLINES;
  return [];
}

/**
 * True for the generic "Ski Bindings" a supplier invoice writes, which is not a Type on its own:
 * the site files a ski binding as either alpine or touring, so the kind has to be decided before
 * the product can be filed at all. Snowboard bindings are not split this way.
 */
export function needsBindingKind(type: string): boolean {
  const value = type.trim();
  if (resolveType(value)) return false; // already specific
  return /\bski\b/i.test(value) && /bindings?\b/i.test(value);
}

/**
 * A ski binding arrives from a supplier as just "Ski Binding". Which of the two it really is comes
 * from an explicit answer where there is one, and otherwise from what the product says about
 * itself. Undefined means nobody has decided yet, which is a question for a person.
 */
export function bindingType(input: Pick<TagInput, "type" | "bindingKind" | "describedAs">): BindingKind | undefined {
  if (!needsBindingKind(input.type)) return undefined;
  return input.bindingKind ?? classifyBinding(input.describedAs, input.type).kind;
}

/**
 * What a boot is for and how it closes. Snowboard boots split by which bindings they take;
 * ski boots carry their discipline and their closure together.
 */
export function bootTags(type: string, describedAs?: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  if (!/boots?\b/i.test(resolved)) return [];
  // With no name or description there is nothing to read, and "most boots are traditional" is a
  // guess rather than a reading. Leave it for a person instead.
  if (!describedAs?.trim()) return [];
  const text = [describedAs, resolved].filter(Boolean).join(" ");
  if (/snowboard/i.test(resolved)) return classifySnowboardBoot(text).tags;
  if ((TYPE_SECTIONS[resolved] ?? []).includes("Ski") || /\bski\b/i.test(resolved)) return classifySkiBoot(text).tags;
  return [];
}

/**
 * Every bag carries all three bag tags, whichever sport it was bought for.
 *
 * Someone shopping for a board bag and someone shopping for a boot bag are looking through the
 * same rack, so the catalogue files each bag on all of them rather than guessing which page the
 * customer started from. All three of the shop's board bags do exactly this.
 */
/** Touring skis share a page with cross-country, so every touring ski carries this as well. */
export const TOURING_SKI_TAG = "touring-and-cross-country-ski";

/**
 * A touring binding belongs in two places: on the Ski menu beside the alpine bindings, and under
 * Backcountry with the rest of the touring kit. The Ski side comes from its Type; this is what
 * puts it on the Backcountry shelf as well.
 */
export const BACKCOUNTRY_BINDING_TAG = "alpine-touring-bindings";
export const SKI_BINDING_SHELF_TAG = "ski-bindings";

/**
 * The same for boots. A touring boot belongs in both sections of the site, so it carries the ski
 * boot shelf as well as the backcountry one — someone browsing ski boots should still find it.
 */
export const BACKCOUNTRY_BOOT_TAG = "alpine-touring-boots";
export const SKI_BOOT_SHELF_TAG = "ski-boots";

/**
 * Skins appear twice in the menu — as Skins under Alpine Touring and as Climbing Skins under
 * Backcountry Gear — and carry both the singular and the plural, so either spelling finds them.
 */
export const SKIN_TAGS = ["skin", "skins"] as const;

/**
 * The tags that put a product on a second shelf beyond the one its Type names.
 *
 * A touring boot arrives by either route — as a "Touring Boots" type, or as a generic "Ski Boots"
 * line the classifier reads as touring — so the boot tags already worked out are passed in rather
 * than the reading being done twice.
 */
export function crossShelfTags(type: string, alreadyTagged: string[] = []): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const out: string[] = [];
  if (resolved === "Touring Bindings") out.push(SKI_BINDING_SHELF_TAG, BACKCOUNTRY_BINDING_TAG);
  if (resolved === "Touring Boots" || alreadyTagged.includes("touring-boots")) {
    out.push(SKI_BOOT_SHELF_TAG, BACKCOUNTRY_BOOT_TAG);
  }
  if (resolved === "Skins" || resolved === "Climbing Skins") out.push(...SKIN_TAGS);
  return out;
}

export const BAG_TAGS = ["snow-bags", "snowboard-bags", "ski-and-boot-bags", "ski-and-snowboard-bags"] as const;

export function bagTags(type: string, describedAs?: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  // Only accessories hold bags; a "Snowboard Bags" type is already one, a named bag inside a
  // general accessories line has to be read from the name.
  const looksLikeBag = /\bbags?\b/i.test(resolved) || (!!describedAs?.trim() && accessoryKind(describedAs) === "bags");

  if (!looksLikeBag) return [];
  return [...BAG_TAGS];
}

/**
 * Which boots a snowboard binding will take. The mirror of the boot tag, and it has to agree with
 * it: a Step On binding and a traditional boot do not meet.
 */
export function snowboardBindingTags(type: string, describedAs?: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  if (!/snowboard\s+bindings?\b/i.test(resolved)) return [];
  if (!describedAs?.trim()) return [];
  return [classifySnowboardBinding(describedAs).tag];
}

/** The package tag for a board or ski sold with a binding on it. */
function packageTagFor(type: string): string {
  const resolved = resolveType(type) ?? type.trim();
  return /snowboard|board/i.test(resolved) ? "Snowboard Packages" : "Ski Packages";
}

export interface TagInput {
  type: string;
  vendor: string;
  /**
   * Sold with a binding fitted, which makes it a package rather than a bare board or ski.
   */
  withBindings?: boolean;
  /**
   * Which kind of ski binding this is. Left off, it is read from the title and description.
   */
  bindingKind?: BindingKind;
  /** Title and description, so a ski binding can be classified when bindingKind is not given. */
  describedAs?: string;
  /**
   * What the ski or board is for. A product can be more than one — the catalogue has boards that
   * are both freeride and freestyle — and anything not open to this product's sport is dropped
   * rather than written, since a tag naming a page that does not exist is worse than no tag.
   */
  disciplines?: string[];
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
 * Boards and skis run a season ahead of the rest of the shop: next winter's are bought and tagged
 * while this winter's clothing is still current. Boots and bindings do not — the shop's own
 * catalogue has fourteen bindings and eight boots on the current season and none on the next,
 * against ten boards on the next.
 *
 * What decides it is the noun being sold, not whether the word "ski" appears anywhere: "Ski Poles"
 * and "Snowboard Bags" are accessories named after the sport. And the rule is confined to the Ski
 * and Snowboard menus, so Outdoor's hiking and apres boots stay on the current season.
 */
const HARDGOOD_NOUNS = new Set(["snowboards", "skis", "boards", "packages"]);

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
 * Tags Shopify writes by itself — price bands, sizes, lengths and colours are all derived from the
 * variants once a product is in the store.
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
  /^length-/i, // board and ski lengths, e.g. length-156, length-156w
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
/** A second sentinel the shop writes by hand alongside the evergreen one. */
export const MANUAL_SEASON = "2998";

const MANUAL_TAGS = new Set(["snow-sale", "snow-clearance", "clearance", "sale", "scan", EVERGREEN_SEASON, MANUAL_SEASON]);
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

  const type = bindingType(input) ?? resolveType(input.type) ?? input.type.trim();
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

  if (input.withBindings) push(TAG_SPELLING[packageTagFor(type)] ?? slugTag(packageTagFor(type)));

  const boots = bootTags(type, input.describedAs);
  for (const tag of bagTags(type, input.describedAs)) push(tag);
  for (const tag of boots) push(tag);
  for (const tag of crossShelfTags(type, boots)) push(tag);
  for (const tag of snowboardBindingTags(type, input.describedAs)) push(tag);

  const allowed = disciplinesFor(type);
  for (const discipline of input.disciplines ?? []) {
    const match = allowed.find((a) => slugTag(a) === slugTag(discipline));
    if (!match) continue;
    push(TAG_SPELLING[match] ?? slugTag(match));
    // Touring skis also sit on the cross-country shelf, which is one page for both.
    if (match === "Touring Skis") push(TOURING_SKI_TAG);
  }

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
