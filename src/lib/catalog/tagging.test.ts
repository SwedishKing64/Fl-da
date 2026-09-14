import { describe, expect, it } from "vitest";
import { DEFAULT_TAGGING, TAG_SPELLING, generalTags, isHardgood, needsSectionChoice, normaliseGenders, seasonFor, slugTag } from "./tagging";

describe("the six general tags", () => {
  it("writes them in the shop's order: type, section, season, house, vendor, gender", () => {
    expect(generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["mens"] })).toEqual([
      "snowboard-boots",
      "snowboard",
      "2027",
      "123abc-js",
      "burton",
      "mens",
    ]);
  });

  it("runs hardgoods a season ahead of everything else", () => {
    expect(seasonFor("Snowboards")).toBe(2027);
    expect(seasonFor("Snowboard Bindings")).toBe(2027);
    expect(seasonFor("Ski Boots")).toBe(2027);
    expect(seasonFor("Snow Jackets")).toBe(2026);
    expect(seasonFor("Ski Poles")).toBe(2026);
  });

  it("does not treat a bag or a tuning tool as a hardgood just because it says snowboard", () => {
    expect(isHardgood("Snowboard Bags")).toBe(false);
    expect(isHardgood("Snowboard Tuning")).toBe(false);
    expect(isHardgood("Ski & Boot Bags")).toBe(false);
    expect(isHardgood("Other Snowboard Accessories")).toBe(false);
  });

  it("leaves a unisex product with no gender tag at all", () => {
    const tags = generalTags({ type: "Snowboard Accessories", vendor: "Burton", genders: [], section: "Snowboard" });
    expect(tags).not.toContain("mens");
    expect(tags).not.toContain("womens");
    expect(tags).toEqual(["snowboard-accessories", "snowboard", "2026", "123abc-js", "burton"]);
  });

  it("carries both genders when a product is sold to both", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens", "womens"] });
    expect(tags.slice(-2)).toEqual(["mens", "womens"]);
  });

  it("asks for a section only where a type really sits in two menus", () => {
    expect(needsSectionChoice("Goggles")).toBe(true); // Ski and Snowboard
    expect(needsSectionChoice("Gaiters")).toBe(true); // Clothing and Outdoor
    expect(needsSectionChoice("Snowboard Boots")).toBe(false);
    // Given the choice, it is honoured rather than guessed.
    expect(generalTags({ type: "Goggles", vendor: "Burton", genders: [], section: "Snowboard" })[1]).toBe("snowboard");
  });

  it("slugs a type the way the catalogue does", () => {
    expect(slugTag("Snowboard Boots")).toBe("snowboard-boots");
    expect(slugTag("Ski & Boot Bags")).toBe("ski-and-boot-bags");
    expect(slugTag("3+ Person Tents")).toBe("3-person-tents");
  });

  it("lets a year be forced for old stock", () => {
    expect(generalTags({ type: "Snowboards", vendor: "Burton", genders: [], year: 2025 })).toContain("2025");
  });

  it("keeps the house tag in one editable place", () => {
    expect(DEFAULT_TAGGING.houseTag).toBe("123abc-js");
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: [] }, { houseTag: "abc123-js", currentYear: 2026 });
    expect(tags).toContain("abc123-js");
  });

  it("never repeats a tag", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Snowboards", genders: [] });
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("clothing", () => {
  it("tags a womens snow jacket with gender and garment", () => {
    expect(generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toEqual([
      "snow jackets",
      "clothing",
      "2026",
      "123abc-js",
      "burton",
      "womens",
    ]);
  });

  it("writes the garment names the way the live catalogue spells them", () => {
    // Hyphenating these would stop the product appearing on the page that filters for it.
    expect(TAG_SPELLING["Snow Jackets"]).toBe("snow jackets");
    expect(generalTags({ type: "Snow Pants", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("snow pants");
    // Single-word garments were never ambiguous.
    expect(generalTags({ type: "Rainwear", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("rainwear");
    expect(generalTags({ type: "Midlayers", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toContain("midlayers");
  });

  it("tags a kids item kids, with no gender beside it", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["kids"], section: "Clothing" });
    expect(tags).toContain("kids");
    expect(tags).not.toContain("mens");
    expect(tags).not.toContain("womens");
  });

  it("drops mens and womens the moment a product is a kids one", () => {
    expect(normaliseGenders(["mens", "kids"])).toEqual(["kids"]);
    expect(normaliseGenders(["mens", "womens"])).toEqual(["mens", "womens"]);
  });
});
