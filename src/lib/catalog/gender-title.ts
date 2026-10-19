/**
 * Snow clothing names who it is for (asked 2026-10-19).
 *
 * No product carries a gender in its title (asked 2026-10-15) — except snow clothing, which the
 * shop asked to be separated by gender and named so: a Burton jacket is "Men's Cyclic GORE-TEX 2L
 * Jacket" and "Women's …", two products, as the shop's own snow garments were always written. The
 * gender goes on the front, the way the shop writes it; Kids' is unchanged everywhere.
 */

import { headingsFor, resolveType } from "./taxonomy";
import { withoutGender } from "./mapping";
import { asShopWritesIt } from "./titles";

const LABEL: Record<string, string> = { mens: "Men's", womens: "Women's" };

/** Whether a product is snow clothing, by its Type or the tags that file it there. */
export function isSnowClothing(productType: string, tags: string[] = []): boolean {
  const type = resolveType(productType) ?? productType.trim();
  if (type === "Snow Clothing" || (type && headingsFor(type).includes("Snow Clothing"))) return true;
  return tags.some((t) => t.trim().toLowerCase() === "snow-clothing");
}

/** Who a gender word or tag list says it is for: "mens", "womens", or "" — unisex and kids say neither. */
export function genderOf(said: string | string[]): string {
  const words = (Array.isArray(said) ? said : [said]).map((w) => w.trim().toLowerCase());
  const men = words.some((w) => /^(m|men|mens|men's|male)$/.test(w));
  const women = words.some((w) => /^(w|women|womens|women's|ladies|female)$/.test(w));
  return men === women ? "" : men ? "mens" : "womens";
}

/** The title with its gender on the front where it is snow clothing; any other product is left as it is. */
export function genderedTitle(title: string, opts: { productType: string; tags?: string[]; gender: string }): string {
  const label = LABEL[opts.gender];
  if (!label || !isSnowClothing(opts.productType, opts.tags)) return title;
  // Cased first: a shouted "CYCLIC JACKET" with "Men's" in front would no longer read as shouting.
  const bare = asShopWritesIt(withoutGender(title).title);
  return bare ? `${label} ${bare}` : title;
}
