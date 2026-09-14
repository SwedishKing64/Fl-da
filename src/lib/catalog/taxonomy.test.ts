import { describe, expect, it } from "vitest";
import { ALPSPORT_TAXONOMY, PRODUCT_TYPES, TYPE_LEAVES, TYPE_SECTION, isValidType, resolveType } from "./taxonomy";

describe("the alpsport menu as a Type vocabulary", () => {
  it("covers every top-level menu that holds products", () => {
    expect(ALPSPORT_TAXONOMY.map((s) => s.top)).toEqual(["Clothing", "Ski", "Snowboard", "Backcountry", "Outdoor"]);
  });

  it("has no duplicate headings, so a Type always names one place", () => {
    expect(new Set(PRODUCT_TYPES).size).toBe(PRODUCT_TYPES.length);
  });

  it("gives every heading a section and at least one leaf", () => {
    for (const type of PRODUCT_TYPES) {
      expect(TYPE_SECTION[type], type).toBeTruthy();
      expect(TYPE_LEAVES[type]?.length, type).toBeGreaterThan(0);
    }
  });

  /** Every Type in the 122-product export the shop supplied is a heading, never a leaf. */
  it("resolves every Type already in use in the live catalogue", () => {
    const inUse = ["Snow Clothing", "Snowboard Bindings", "Ski Accessories", "Snowboard Accessories", "Snowboard Boots", "Snowboards", "Back-Country Gear"];
    for (const type of inUse) expect(isValidType(type), type).toBe(true);
  });

  it("absorbs the site's own inconsistent hyphenation", () => {
    expect(resolveType("Back-Country Gear")).toBe("Backcountry Gear");
    expect(resolveType("backcountry gear")).toBe("Backcountry Gear");
  });

  it("refuses a type that has nowhere to live", () => {
    expect(resolveType("Down Sleeping Bags")).toBeUndefined(); // a leaf, not a heading
    expect(resolveType("Widgets")).toBeUndefined();
    expect(resolveType("")).toBeUndefined();
  });

  it("files a ski strap and a sleeping bag where the shop said they go", () => {
    expect(TYPE_SECTION["Ski Accessories"]).toBe("Ski");
    expect(TYPE_LEAVES["Sleeping Bags"]).toContain("Down Sleeping Bags");
  });
});
