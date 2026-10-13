import { describe, expect, it } from "vitest";
import { ALPSPORT_TAXONOMY, PRODUCT_TYPES, TYPE_LEAVES, TYPE_PARENTS, TYPE_SECTIONS, isAudienceLeaf, isValidType, resolveType } from "./taxonomy";

describe("the alpsport menu as a Type vocabulary", () => {
  it("covers every top-level menu that holds products", () => {
    expect(ALPSPORT_TAXONOMY.map((s) => s.top)).toEqual(["Clothing", "Ski", "Snowboard", "Backcountry", "Outdoor"]);
  });

  it("has no duplicate types, so a Type always names one kind of product", () => {
    expect(new Set(PRODUCT_TYPES).size).toBe(PRODUCT_TYPES.length);
  });

  it("tells an audience split from a kind of product", () => {
    expect(isAudienceLeaf("Mens Boots")).toBe(true);
    expect(isAudienceLeaf("Kids Snowboards")).toBe(true);
    expect(isAudienceLeaf("Down Sleeping Bags")).toBe(false);
    expect(isAudienceLeaf("Ski Poles")).toBe(false);
  });

  /** The two examples the shop gave, which between them fix where the line falls. */
  it("keeps the heading where the sub-links only split by audience", () => {
    // Mens / Womens / Kids Boots are the same product for different people.
    expect(PRODUCT_TYPES).toContain("Snowboard Boots");
    expect(PRODUCT_TYPES).not.toContain("Mens Boots");
  });

  it("takes the sub-link where it names a different kind of product", () => {
    expect(PRODUCT_TYPES).toContain("Synthetic Sleeping Bags");
    expect(PRODUCT_TYPES).toContain("Down Sleeping Bags");
    // Both are in the vocabulary: an invoice names the sub-link, the Type column holds the heading.
    expect(PRODUCT_TYPES).toContain("Sleeping Bags");
  });

  it("says which menu a type is tagged into", () => {
    expect(TYPE_SECTIONS["Snowboard Boots"]).toEqual(["Snowboard"]);
    expect(TYPE_SECTIONS["Synthetic Sleeping Bags"]).toEqual(["Outdoor"]);
    // Some kinds genuinely live in more than one menu, and the tag has to say which.
    expect(TYPE_SECTIONS["Gaiters"]).toEqual(expect.arrayContaining(["Clothing", "Outdoor"]));
  });

  it("remembers which group a type sits under", () => {
    expect(TYPE_PARENTS["Down Sleeping Bags"]).toEqual(["Sleeping Bags"]);
    expect(TYPE_PARENTS["Ski Poles"]).toEqual(["Ski Accessories"]);
  });

  it("keeps every group's sub-links whole for display", () => {
    expect(TYPE_LEAVES["Snowboard Boots"]).toEqual(["Mens Boots", "Womens Boots", "Kids Boots"]);
  });

  it("absorbs the site's own inconsistent hyphenation", () => {
    expect(resolveType("Back-Country Gear")).toBe("Backcountry Gear");
  });

  it("refuses a type that has nowhere to live", () => {
    expect(resolveType("Widgets")).toBeUndefined();
    expect(resolveType("")).toBeUndefined();
    expect(isValidType("Mens Boots")).toBe(false); // an audience, not a kind
  });
});

describe("accessories keep their heading as the Type", () => {
  it("accepts the accessories headings as Types", () => {
    expect(PRODUCT_TYPES).toContain("Ski Accessories");
    expect(PRODUCT_TYPES).toContain("Snowboard Accessories");
    expect(PRODUCT_TYPES).toContain("Outdoor Accessories");
  });

  it("still knows which menu each sits under, so the section tag is written", () => {
    expect(TYPE_SECTIONS["Snowboard Accessories"]).toEqual(["Snowboard"]);
    expect(TYPE_SECTIONS["Ski Accessories"]).toEqual(["Ski"]);
  });

  it("keeps the shelves as Types too, since they are tagged by name", () => {
    expect(PRODUCT_TYPES).toContain("Ski Gloves");
    expect(PRODUCT_TYPES).toContain("Body Protection");
    expect(PRODUCT_TYPES).toContain("Other Snowboard Accessories");
  });

  it("keeps the headings that group by audience out of the vocabulary", () => {
    // A garment is typed Snow Clothing or Outdoor Clothing — what it is for — never Mens Clothing.
    for (const heading of ["Mens Clothing", "Womens Clothing", "Kids Clothing"]) {
      expect(PRODUCT_TYPES, heading).not.toContain(heading);
    }
    expect(PRODUCT_TYPES).toContain("Snow Clothing");
  });
});

describe("backcountry gear is filed under its heading", () => {
  /** The shop's avalanche export types every product Back-Country Gear, shelf as a tag. */
  it("accepts the heading as a Type with a section", () => {
    expect(PRODUCT_TYPES).toContain("Backcountry Gear");
    expect(TYPE_SECTIONS["Backcountry Gear"]).toEqual(["Backcountry"]);
    expect(resolveType("Back-Country Gear")).toBe("Backcountry Gear");
  });

  it("keeps its shelves as Types too", () => {
    for (const shelf of ["Avalanche Equipment", "Climbing Skins", "Snow Packs", "Ice Tools", "Other Back-Country Gear"]) {
      expect(PRODUCT_TYPES, shelf).toContain(shelf);
    }
  });
});
