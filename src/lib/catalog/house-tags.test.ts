import { describe, expect, it } from "vitest";
import { houseTags } from "./product-tags";
import { DEFAULT_TAG_RULES } from "./rules";

/**
 * How a tag is spelled, settled against the shop's own catalogue.
 *
 * Of the 334 distinct tags across the 827 products in their nine Shopify exports, not one contains
 * an uppercase letter. Seeded tag rules were nonetheless adding "Mens", "Womens" and "New Season",
 * and because rules run after the categoriser their additions reached the column unchecked — so a
 * jacket went out tagged "mens, womens, Womens, Mens": the same two tags twice.
 *
 * Note that hyphenation is per-tag and is NOT normalised here: the catalogue writes "snow-clothing"
 * with a hyphen and "snow jackets" with a space, and both are correct because that is what the
 * shop's own products carry.
 */
describe("house tag spelling", () => {
  it("lower-cases, because the catalogue has no capitals anywhere", () => {
    expect(houseTags(["Mens", "New Season", "Snow-Clothing"])).toEqual(["mens", "new season", "snow-clothing"]);
  });

  it("treats a tag that differs only by case as the same tag", () => {
    expect(houseTags(["mens", "womens", "Womens", "Mens"])).toEqual(["mens", "womens"]);
  });

  it("keeps the first spelling's position and drops blanks", () => {
    expect(houseTags(["snow jackets", "", "  ", "2026", "SNOW JACKETS"])).toEqual(["snow jackets", "2026"]);
  });

  it("leaves per-tag hyphenation alone", () => {
    // Both are real: 70 products carry "snow-clothing", 24 carry "snow jackets".
    expect(houseTags(["snow-clothing", "snow jackets"])).toEqual(["snow-clothing", "snow jackets"]);
  });

  it("ships no seeded rule that adds a tag the shop does not write", () => {
    for (const rule of DEFAULT_TAG_RULES) {
      for (const tag of rule.addTags.split(",").map((t) => t.trim()).filter(Boolean)) {
        expect(tag, `rule "${rule.name}" adds ${tag}`).toBe(tag.toLowerCase());
      }
    }
  });
});
