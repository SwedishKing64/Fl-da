import { describe, expect, it } from "vitest";
import { SNOW_OUTDOOR_TAXONOMY, productTypes, typeLeaves, typeParents, typeSections, isAudienceLeaf, isValidType, resolveType } from "./taxonomy";

describe("the alpsport menu as a Type vocabulary", () => {
  it("covers every top-level menu that holds products", () => {
    expect(SNOW_OUTDOOR_TAXONOMY.map((s) => s.top)).toEqual(["Clothing", "Ski", "Snowboard", "Backcountry", "Outdoor"]);
  });

  it("has no duplicate types, so a Type always names one kind of product", () => {
    expect(new Set(productTypes()).size).toBe(productTypes().length);
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
    expect(productTypes()).toContain("Snowboard Boots");
    expect(productTypes()).not.toContain("Mens Boots");
  });

  it("takes the sub-link where it names a different kind of product", () => {
    expect(productTypes()).toContain("Synthetic Sleeping Bags");
    expect(productTypes()).toContain("Down Sleeping Bags");
    // Both are in the vocabulary: an invoice names the sub-link, the Type column holds the heading.
    expect(productTypes()).toContain("Sleeping Bags");
  });

  it("says which menu a type is tagged into", () => {
    expect(typeSections()["Snowboard Boots"]).toEqual(["Snowboard"]);
    expect(typeSections()["Synthetic Sleeping Bags"]).toEqual(["Outdoor"]);
    // Some kinds genuinely live in more than one menu, and the tag has to say which.
    expect(typeSections()["Gaiters"]).toEqual(expect.arrayContaining(["Clothing", "Outdoor"]));
  });

  it("remembers which group a type sits under", () => {
    expect(typeParents()["Down Sleeping Bags"]).toEqual(["Sleeping Bags"]);
    expect(typeParents()["Ski Poles"]).toEqual(["Ski Accessories"]);
  });

  it("keeps every group's sub-links whole for display", () => {
    expect(typeLeaves()["Snowboard Boots"]).toEqual(["Mens Boots", "Womens Boots", "Kids Boots"]);
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
    expect(productTypes()).toContain("Ski Accessories");
    expect(productTypes()).toContain("Snowboard Accessories");
    expect(productTypes()).toContain("Outdoor Accessories");
  });

  it("still knows which menu each sits under, so the section tag is written", () => {
    expect(typeSections()["Snowboard Accessories"]).toEqual(["Snowboard"]);
    expect(typeSections()["Ski Accessories"]).toEqual(["Ski"]);
  });

  it("keeps the shelves as Types too, since they are tagged by name", () => {
    expect(productTypes()).toContain("Ski Gloves");
    expect(productTypes()).toContain("Body Protection");
    expect(productTypes()).toContain("Other Snowboard Accessories");
  });

  it("keeps the headings that group by audience out of the vocabulary", () => {
    // A garment is typed Snow Clothing or Outdoor Clothing — what it is for — never Mens Clothing.
    for (const heading of ["Mens Clothing", "Womens Clothing", "Kids Clothing"]) {
      expect(productTypes(), heading).not.toContain(heading);
    }
    expect(productTypes()).toContain("Snow Clothing");
  });
});

describe("backcountry gear is filed under its heading", () => {
  /** The shop's avalanche export types every product Back-Country Gear, shelf as a tag. */
  it("accepts the heading as a Type with a section", () => {
    expect(productTypes()).toContain("Backcountry Gear");
    expect(typeSections()["Backcountry Gear"]).toEqual(["Backcountry"]);
    expect(resolveType("Back-Country Gear")).toBe("Backcountry Gear");
  });

  it("keeps its shelves as Types too", () => {
    for (const shelf of ["Avalanche Equipment", "Climbing Skins", "Snow Packs", "Ice Tools", "Other Back-Country Gear"]) {
      expect(productTypes(), shelf).toContain(shelf);
    }
  });
});
