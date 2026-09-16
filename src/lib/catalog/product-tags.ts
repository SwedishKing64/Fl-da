/**
 * The tags a built product carries.
 *
 * This is where the catalogue's tagging rules meet a real product, and until now nothing did:
 * `generalTags` — the type tag, the heading, the section, the season, the house marker, the vendor
 * and the gender — was written, tested, and never called by the application. What reached the CSV
 * instead was whatever an extractor happened to put in a tags column, which is how a Spyder jacket
 * arrived tagged "Technical Outerwear" with no year and no house tag.
 *
 * So the shop's tags are computed here, and what came off the invoice is treated as what it is:
 * a hint about gender or discipline, not a tag to publish. A tag naming a page the shop does not
 * have is worse than no tag — nobody browsing ever lands on it, and it looks like a typo forever.
 */

import { generalTags, gendersFromText, isShopifyGenerated, slugTag, type Gender } from "./tagging";
import { isValidType, resolveType } from "./taxonomy";
import type { CanonicalLineItem } from "./types";

export interface CatalogTagInput {
  /** The Type from the category rule — a taxonomy leaf such as "Snow Jackets". */
  productType: string;
  brand: string;
  items: CanonicalLineItem[];
  /** Tags assembled from the category rule and the invoice, kept only where the shop uses them. */
  ruleTags: string[];
  /** Title and description, for reading gender and what kind of thing it is. */
  describedAs: string;
}

export function catalogTags(input: CatalogTagInput): string[] {
  const type = resolveType(input.productType) ?? input.productType.trim();

  // Without a Type the taxonomy recognises there is no shelf to tag, so the invoice's own tags are
  // all there is. Kept rather than dropped: a person can see them in the grid and fix the Type.
  if (!type || !isValidType(type)) return dedupe(input.ruleTags.map(slugTag));

  const genders = gendersOf(input);
  const year = seasonOf(input.items);

  const tags = generalTags({
    type,
    vendor: input.brand,
    genders,
    describedAs: input.describedAs,
    ...(year ? { year } : {}),
  });

  // Anything off the invoice that the shop genuinely uses is kept alongside; the rest is dropped.
  const known = new Set(tags.map((t) => t.toLowerCase()));
  for (const raw of input.ruleTags) {
    const tag = slugTag(raw);
    if (!tag || known.has(tag.toLowerCase())) continue;
    if (isShopifyGenerated(tag)) continue; // Shopify maintains its own size/colour/price bands
    if (isInvented(raw, genders)) continue;
    tags.push(tag);
    known.add(tag.toLowerCase());
  }
  return dedupe(tags);
}

/**
 * Whether a tag off the invoice is one the shop would never write.
 *
 * Gender, season and brand are already said properly by the general tags, so a second copy in the
 * supplier's spelling ("Mens", "SPYDER", "FW26") is noise. A marketing phrase an extractor made up
 * is the case this exists for.
 */
function isInvented(raw: string, genders: Gender[]): boolean {
  const value = raw.trim().toLowerCase();
  if (!value) return true;
  if (/^(mens?|womens?|unisex|kids?|junior|youth|boys?|girls?|ladies)$/.test(value)) return true;
  if (/^(fw|ss|aw)\s*\d{2,4}$/.test(value) || /^\d{2}\/\d{2}$/.test(value)) return true;
  void genders;
  // Two or more words that are not a shelf name: a description, not a tag.
  return value.split(/\s+/).length > 1;
}

/** Gender from the invoice's own column first, then from the title. */
function gendersOf(input: CatalogTagInput): Gender[] {
  const stated = input.items.map((i) => i.gender).filter(Boolean).join(" ");
  const fromColumn = gendersFromText(stated);
  return fromColumn.length > 0 ? fromColumn : gendersFromText(input.describedAs);
}

/** A four-digit season on the invoice wins over the one the shelf would imply. */
function seasonOf(items: CanonicalLineItem[]): number | undefined {
  for (const item of items) {
    const match = /(20\d{2})/.exec(item.season ?? "");
    if (match) return Number(match[1]);
  }
  return undefined;
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
