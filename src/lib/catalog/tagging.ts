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

import { ALPSPORT_TAXONOMY, PRODUCT_TYPES, TYPE_SECTIONS, clothingContextsFor, headingsFor, isValidType, resolveType } from "./taxonomy";
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

/** The section a backcountry shelf sits in. Without it the shelf tag names a page nobody reaches. */
export const BACKCOUNTRY_SECTION_TAG = "backcountry";

/**
 * The same for boots. A touring boot belongs in both sections of the site, so it carries the ski
 * boot shelf as well as the backcountry one — someone browsing ski boots should still find it.
 */
export const BACKCOUNTRY_BOOT_TAG = "alpine-touring-boots";
export const SKI_BOOT_SHELF_TAG = "ski-boots";

/** And for the skis themselves, when one arrives as an ordinary ski that happens to tour. */
export const BACKCOUNTRY_SKI_TAG = "alpine-touring-skis";

/**
 * Skins appear twice in the menu — as Skins under Alpine Touring and as Climbing Skins under
 * Backcountry Gear — and carry both the singular and the plural, so either spelling finds them.
 */
export const SKIN_TAGS = ["skin", "skins"] as const;

/**
 * Gear for skins rather than skins themselves — trim tools, cutters, glue, skin wax, skin bags.
 * The shop files these in three places at once: with the backcountry gear, on the climbing skins
 * page beside what they are for, and with the touring accessories.
 */
export const SKIN_ACCESSORY_TAGS = ["back-country-gear", "climbing-skins", "alpine-touring-accessories"] as const;

const SKIN_ACCESSORY = /\bskin\b.*\b(cutter|trim|tool|glue|wax|bag|saver|sheet)|\b(cutter|trim|tool|glue|wax|bag|saver|sheet)\b.*\bskin\b/i;

export function isSkinAccessory(describedAs?: string): boolean {
  return !!describedAs?.trim() && SKIN_ACCESSORY.test(describedAs);
}

/**
 * The general accessories lines a supplier writes when it has not decided what something is.
 *
 * A Type this broad is a filing cabinet rather than a claim, so a product inside one can be read
 * and filed properly. A Type that names something specific is believed instead.
 */
const GENERIC_ACCESSORY_TYPES = new Set<string>([
  "Ski Accessories",
  "Other Ski Accessories",
  "Alpine Touring Accessories",
  "Cross-Country Accessories",
  "Backcountry Gear",
  "Other Back-Country Gear",
]);

const SKIN = /\bskins?\b/i;

/**
 * A skin itself, rather than the gear that maintains one.
 *
 * Suppliers file skins wherever they like — a Pomoca line arrives as "Ski Accessories" as often as
 * "Skins" — and a skin filed that way reached no shelf at all. So the product is read rather than
 * trusted to its invoice Type. Gear *for* skins is a different shelf and is tested first, so a skin
 * cutter never comes back as a skin, and a Type that already names something specific is left alone
 * rather than overruled by the word appearing in a description.
 */
export function isSkin(describedAs?: string, type?: string): boolean {
  if (!describedAs?.trim() || isSkinAccessory(describedAs)) return false;
  if (!SKIN.test(describedAs)) return false;
  const resolved = resolveType(type ?? "") ?? (type ?? "").trim();
  if (!resolved) return true;
  if (resolved === "Skins" || resolved === "Climbing Skins") return true;
  return GENERIC_ACCESSORY_TYPES.has(resolved) || !isValidType(resolved);
}

/** The Type a skin should really have been given, when the invoice filed it somewhere general. */
export function skinType(input: Pick<TagInput, "type" | "describedAs">): "Skins" | undefined {
  const resolved = resolveType(input.type) ?? input.type.trim();
  if (resolved === "Skins" || resolved === "Climbing Skins") return undefined; // already right
  return isSkin(input.describedAs, input.type) ? "Skins" : undefined;
}

/**
 * The tags that put a product on a second shelf beyond the one its Type names.
 *
 * A touring boot arrives by either route — as a "Touring Boots" type, or as a generic "Ski Boots"
 * line the classifier reads as touring — so the boot tags already worked out are passed in rather
 * than the reading being done twice.
 *
 * Reaching a second shelf takes two tags, not one: the shelf itself, and the section it sits in.
 * A touring binding tagged only alpine-touring-bindings names a shelf inside a section it is not
 * in, so it never appears there. Its Type puts it in Ski; this puts it in Backcountry as well.
 */
export function crossShelfTags(type: string, alreadyTagged: string[] = []): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const out: string[] = [];
  if (resolved === "Touring Bindings") out.push(SKI_BINDING_SHELF_TAG, BACKCOUNTRY_BINDING_TAG);
  if (resolved === "Touring Boots" || alreadyTagged.includes("touring-boots")) {
    out.push(SKI_BOOT_SHELF_TAG, BACKCOUNTRY_BOOT_TAG);
  }
  // The two menu links — Skins under Alpine Touring, Climbing Skins under Backcountry Gear — open
  // the same page, so a skin carries every name that page is reached by whichever way it was filed.
  if (resolved === "Skins" || resolved === "Climbing Skins") out.push(...SKIN_TAGS, "climbing-skins");
  // The touring and cross-country shelf is one page for both, so a cross-country ski belongs on
  // it as surely as a touring ski does.
  if (resolved === "Cross-Country Skis") out.push(TOURING_SKI_TAG);
  // A touring ski reaches backcountry whether it was typed as one or arrived as an ordinary ski
  // whose discipline says it tours.
  if (resolved === "Touring Skis" || alreadyTagged.includes("touring-skis")) out.push(BACKCOUNTRY_SKI_TAG);
  // Anything that reached a backcountry shelf needs the section to go with it. Skins are a
  // backcountry shelf as surely as the touring bindings are, so this reads the whole menu rather
  // than the alpine-touring prefix.
  if (out.some(isBackcountryShelf)) out.push(BACKCOUNTRY_SECTION_TAG);
  return out;
}

const SNOW_BAG = /\b(ski|snowboard|board|boot)\b/i;

export const BAG_TAGS = ["snow-bags", "snowboard-bags", "ski-and-boot-bags", "ski-and-snowboard-bags"] as const;

export function bagTags(type: string, describedAs?: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  // Only accessories hold bags; a "Snowboard Bags" type is already one, a named bag inside a
  // general accessories line has to be read from the name.
  const looksLikeBag = /\bbags?\b/i.test(resolved) || (!!describedAs?.trim() && accessoryKind(describedAs) === "bags");

  if (!looksLikeBag) return [];

  // These are the snow shelves. A sleeping bag is a bag and a duffel holds a week of clothes, but
  // neither belongs beside the board bags — the word in the Type is not what puts it there, the
  // menu the product sits in is. An unrecognised Type has no menu, so the product is read instead.
  const sections = TYPE_SECTIONS[resolved] ?? [];
  const snow = sections.some((s) => s === "Ski" || s === "Snowboard");
  if (!snow && sections.length > 0) return [];
  if (!snow && !SNOW_BAG.test(`${resolved} ${describedAs ?? ""}`)) return [];

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

/**
 * Whether a garment is snow kit or outdoor kit, tagged alongside the garment itself.
 *
 * The menu settles it for every garment but one: a snow jacket only ever appears under Snow
 * Clothing, a hiking sock only under Outdoor Clothing. Midlayers appears under both, so that one
 * needs telling — and defaults to snow, which is what this shop mostly sells and what its own
 * midlayers are tagged.
 */
export function clothingContextTags(type: string, told?: string): string[] {
  const contexts = clothingContextsFor(type);
  if (contexts.length === 0) return [];
  if (contexts.length === 1) return [slugTag(contexts[0])];
  const wanted = contexts.find((c) => slugTag(c) === slugTag(told ?? ""));
  return [slugTag(wanted ?? "Snow Clothing")];
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
  /** "Snow Clothing" or "Outdoor Clothing", for the one garment the menu places under both. */
  clothingContext?: string;
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
export const TAG_SPELLING: Record<string, string> = {
  // The menu heading reads "Backcountry Gear" but every product filed under it is tagged
  // back-country-gear, and a tag is an exact string.
  "Backcountry Gear": "back-country-gear",
};

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
/**
 * Promotions are named after whatever is on promotion, so they cannot be listed — tent sale, easter
 * sale, outdoor clearance, tent promo are all one shop's markdown this month. Matched by shape
 * instead, because the cost of missing one is high: "tent sale" sits on all twenty-seven tents in
 * the Nemo export, so a template would learn it as a house convention and every tent the importer
 * built after that would be born on sale. Superseded is the same kind of marker for old stock.
 */
const MANUAL_PATTERNS: RegExp[] = [/^bonus\d+$/i, /(^|-)(sale|promo|clearance)$/i, /^superseded$/i];

export function isManualTag(tag: string): boolean {
  const value = slugTag(tag);
  return MANUAL_TAGS.has(value) || MANUAL_PATTERNS.some((p) => p.test(value));
}

/**
 * Tags the rules work out for themselves from a product's own fields.
 *
 * These must never be learned from an export. The rule already applies each one to the products it
 * belongs on; learning it takes one product's answer and stamps it on every product of the brand.
 * An avalanche export carrying "touring and cross-country ski" on sixteen of seventeen products —
 * drift, not a rule — would otherwise teach the importer to put it on every probe and shovel.
 */
export function isRuleGenerated(tag: string): boolean {
  const value = slugTag(tag);
  if (!value) return false;
  if (/^(19|20)\d{2}$/.test(value)) return true; // a season
  if (["mens", "womens", "kids"].includes(value)) return true;
  // The house marker by shape, since the suffix varies with whoever built the product.
  if (/^123abc-/.test(value)) return true;
  if (["ski", "snowboard", "clothing", "backcountry", "outdoor"].includes(value)) return true;
  if (RULE_TAGS.has(value)) return true;
  return PRODUCT_TYPES.some((t) => slugTag(TAG_SPELLING[t] ?? t) === value);
}

/** The tags the rules add beyond a product's Type: shelves, packages, closures and disciplines. */
const RULE_TAGS = new Set<string>([
  ...BAG_TAGS,
  ...SKIN_TAGS,
  TOURING_SKI_TAG,
  BACKCOUNTRY_BINDING_TAG,
  BACKCOUNTRY_BOOT_TAG,
  BACKCOUNTRY_SKI_TAG,
  SKI_BINDING_SHELF_TAG,
  SKI_BOOT_SHELF_TAG,
  "ski-packages",
  "snowboard-packages",
  "step-on-boots",
  "traditional-boots",
  "step-on-bindings",
  "traditional-bindings",
  "alpine-boots",
  "race-boots",
  "touring-boots",
  "buckle-ski-boots",
  "boa-ski-boots",
]);

/**
 * Tags the importer must never write: Shopify derives its own, and staff apply theirs by hand.
 * Tags already on a product are left alone — a person put them there.
 */
export function isNotOurs(tag: string): boolean {
  return isShopifyGenerated(tag) || isManualTag(tag);
}

/**
 * Tags a template must never learn. Everything the importer will not write, plus everything the
 * rules already work out per product — learning one of those takes a single product's answer and
 * stamps it on every product of the brand.
 */
export function isNotLearnable(tag: string): boolean {
  return isNotOurs(tag) || isRuleGenerated(tag);
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

  const type = bindingType(input) ?? skinType(input) ?? resolveType(input.type) ?? input.type.trim();
  if (type) push(TAG_SPELLING[type] ?? slugTag(type));

  for (const tag of headingTags(type, input.section ?? input.clothingContext)) push(tag);

  const chosen = sectionsFor(type, input.section);
  for (const value of chosen) push(slugTag(value));

  // Outdoor does not run on a season: a tent or a stove is the same product next winter, so it
  // carries the evergreen marker rather than a year. Verified against the shop's own instruction
  // rather than its export, where the Nemo and One Planet products carry the year they were added.
  const evergreen = input.evergreen || chosen.includes("Outdoor");
  push(evergreen ? EVERGREEN_SEASON : String(input.year ?? seasonFor(type, settings)));
  push(settings.houseTag);
  push(slugTag(input.vendor));
  for (const gender of normaliseGenders(input.genders)) push(gender);

  if (input.withBindings) push(TAG_SPELLING[packageTagFor(type)] ?? slugTag(packageTagFor(type)));

  for (const tag of clothingContextTags(type, input.clothingContext)) push(tag);

  const boots = bootTags(type, input.describedAs);
  for (const tag of bagTags(type, input.describedAs)) push(tag);
  for (const tag of boots) push(tag);
  for (const tag of snowboardBindingTags(type, input.describedAs)) push(tag);

  const allowed = disciplinesFor(type);
  const disciplineTags: string[] = [];
  for (const discipline of input.disciplines ?? []) {
    const match = allowed.find((a) => slugTag(a) === slugTag(discipline));
    if (!match) continue;
    const tag = TAG_SPELLING[match] ?? slugTag(match);
    disciplineTags.push(tag);
    push(tag);
    // Touring skis also sit on the cross-country shelf, which is one page for both.
    if (match === "Touring Skis") push(TOURING_SKI_TAG);
  }

  // Last, because what puts a product on a second shelf depends on everything decided above.
  for (const tag of crossShelfTags(type, [...boots, ...disciplineTags])) push(tag);

  // Skin gear sits in three places at once, wherever the invoice happened to file it.
  if (isSkinAccessory(input.describedAs)) for (const tag of SKIN_ACCESSORY_TAGS) push(tag);

  // A backcountry shelf always carries the backcountry section, however the product reached the
  // shelf: from its own Type, from a cross-shelf rule, or as skin gear. Filing a touring product
  // under the Ski menu adds a section, it does not move it out of Backcountry.
  if (tags.some(isBackcountryShelf)) push(BACKCOUNTRY_SECTION_TAG);

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

/**
 * The heading a product sits under, as a tag.
 *
 * A product carries both: the sub-link it lands on and the heading above it. Every one of the 101
 * Nemo and One Planet products carries its heading tag, and every one carries at least one sub-link
 * tag — a tent is `tents` and `2 person tents`, not one or the other. Where the menu files a product
 * under two headings it takes both if it genuinely belongs to both, and otherwise waits to be told.
 */
export function headingTags(type: string, told?: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const headings = headingsFor(resolved).filter((h) => h !== resolved);
  if (headings.length === 0) return [];
  if (headings.length === 1 || BOTH_SECTIONS.has(resolved)) return headings.map((h) => TAG_SPELLING[h] ?? slugTag(h));
  const wanted = headings.find((h) => slugTag(h) === slugTag(told ?? ""));
  return wanted ? [TAG_SPELLING[wanted] ?? slugTag(wanted)] : [];
}

/**
 * What goes in the Shopify `Type` column: the heading, never the sub-link.
 *
 * An invoice that says "Down Sleeping Bags" is naming a shelf, and the shop files that product as
 * Sleeping Bags. Undefined where the menu files it under two headings and nobody has said which.
 */
export function productTypeFor(type: string, told?: string): string | undefined {
  const resolved = resolveType(type) ?? type.trim();
  const headings = headingsFor(resolved);
  const heading = headings.length === 1 ? headings[0] : headings.find((h) => slugTag(h) === slugTag(told ?? ""));
  return heading === undefined ? undefined : spellHeading(heading);
}

/**
 * The menu draws an ampersand; the Type column spells it out. "Packs & Bags" is written Packs and
 * Bags on all forty-six of the shop's packs, "Climbing & Abseiling" as Climbing and Abseiling on all
 * forty. Only the tag keeps the menu's own punctuation.
 */
export function spellHeading(heading: string): string {
  return heading.replace(/\s*&\s*/g, " and ");
}

/**
 * Types that belong under two menus at once rather than one of them.
 *
 * Most Types that appear twice are one product sold to two sports — a pair of goggles is bought
 * either by a skier or by a boarder, and which menu it is filed under is a decision. A gaiter is
 * not: the same gaiter is outdoor kit and clothing, and it sits on both.
 */
const BOTH_SECTIONS = new Set<string>(["Gaiters"]);

/**
 * Which menus to tag a product with. A Type in exactly one menu needs no help, a Type in two is a
 * question answered by the invoice or by a person — unless it is one of the few that belong in
 * both, which take both.
 */
export function sectionsFor(type: string, told?: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const sections = TYPE_SECTIONS[resolved] ?? [];
  if (BOTH_SECTIONS.has(resolved)) return sections;
  const chosen = told?.trim();
  if (chosen) return sections.find((s) => slugTag(s) === slugTag(chosen)) ? [chosen] : [chosen];
  return sections.length === 1 ? sections : [];
}

/** Which menus a Type could be filed under, for asking a person when it is genuinely ambiguous. */
export function candidateSections(type: string): string[] {
  return TYPE_SECTIONS[resolveType(type) ?? type] ?? [];
}

/** True when a Type sits in more than one menu, so the section tag cannot be inferred. */
export function needsSectionChoice(type: string): boolean {
  const resolved = resolveType(type) ?? type.trim();
  if (BOTH_SECTIONS.has(resolved)) return false; // it goes in both, so there is nothing to choose
  return candidateSections(type).length > 1;
}

export const KNOWN_TYPES = PRODUCT_TYPES;

/**
 * Every shelf that lives under the Backcountry menu, by the tag that reaches it.
 *
 * A shelf tag on its own names a page inside a section the product is not in, so it never appears
 * there. These are the tags that oblige a product to carry the section as well — whichever menu
 * the product was filed under, and whichever route it took to the shelf.
 */
export const BACKCOUNTRY_SHELF_TAGS: ReadonlySet<string> = new Set<string>([
  ...(ALPSPORT_TAXONOMY.find((s) => s.top === "Backcountry")?.groups.flatMap((g) => [
    TAG_SPELLING[g.heading] ?? slugTag(g.heading),
    ...g.leaves.map((leaf) => TAG_SPELLING[leaf] ?? slugTag(leaf)),
  ]) ?? []),
  ...SKIN_TAGS,
  TOURING_SKI_TAG,
]);

export function isBackcountryShelf(tag: string): boolean {
  return BACKCOUNTRY_SHELF_TAGS.has(slugTag(tag));
}
