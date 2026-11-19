import { afterEach, describe, expect, it } from "vitest";
import { categoryById, resolveCategory, taxonomyRelease } from "./shopify-taxonomy";
import { SNOW_TEST_CONVENTIONS, BLANK_CONVENTIONS, activateConventions, activeTree, categoryForKind } from "./taxonomy";
import { SNOW_OUTDOOR_CATEGORIES } from "./trades/shopify-categories";
import { productCategoryFor } from "./pipeline-pure";

afterEach(() => activateConventions(SNOW_TEST_CONVENTIONS));

describe("Shopify's Standard Product Taxonomy", () => {
  it("is the 2026-08 release, with full paths rebuilt from the ids", () => {
    expect(taxonomyRelease()).toBe("2026-08");
    expect(categoryById("sg-4-2-17")?.path).toBe("Sporting Goods > Outdoor Recreation > Camping & Hiking > Tents");
    expect(categoryById("gid://shopify/TaxonomyCategory/aa-2-13")?.name).toBe("Gloves & Mittens");
  });

  it("knows every category the packs place a kind in", () => {
    const missing = Object.entries(SNOW_OUTDOOR_CATEGORIES).filter(([, id]) => !categoryById(id)).map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it("places every kind of product the snow-and-outdoor pack has", () => {
    activateConventions(SNOW_TEST_CONVENTIONS);
    const kinds = activeTree().flatMap((s) => s.groups.flatMap((g) => [g.heading, ...g.leaves]));
    const unplaced = [...new Set(kinds)].filter((k) => !categoryForKind(k));
    expect(unplaced).toEqual([]);
  });

  it("finds a kind a shop taught it by name, and refuses to guess where the name does not say", () => {
    expect(resolveCategory("Tents")?.id).toBe("sg-4-2-17");
    expect(resolveCategory("Sleeping Bags")?.id).toBe("sg-4-2-14");
    expect(resolveCategory("Gloves")?.id).toBe("aa-2-13");
    expect(resolveCategory("Bikes")?.path).toBe("Sporting Goods > Outdoor Recreation > Cycling > Bicycles");
    expect(resolveCategory("Hiking Packs")?.path ?? "").not.toMatch(/Fanny/);
    expect(resolveCategory("Gift Vouchers 2026")).toBeNull();
  });

  it("is written on every product of a shop outside the snow trade, and only where the ski shop writes it for the ski shop", () => {
    activateConventions(SNOW_TEST_CONVENTIONS);
    expect(productCategoryFor("Skis")).toBe("Sporting Goods > Outdoor Recreation > Winter Sports & Activities > Skiing & Snowboarding > Skis > Downhill Skis");
    expect(productCategoryFor("Tents")).toBeUndefined();
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    expect(productCategoryFor("Tents")).toBe("Sporting Goods > Outdoor Recreation > Camping & Hiking > Tents");
    expect(productCategoryFor("Hiking Packs")).toBe("Luggage & Bags > Backpacks > Hiking Backpacks");
  });
});
