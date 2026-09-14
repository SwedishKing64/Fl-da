import { describe, expect, it } from "vitest";
import { DEFAULT_TAGGING, EVERGREEN_SEASON, TAG_SPELLING, generalTags, isHardgood, isManualTag, isNotOurs, isShopifyGenerated, needsSectionChoice, normaliseGenders, seasonFor, slugTag, withoutGenerated } from "./tagging";

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
      "snow-jackets",
      "clothing",
      "2026",
      "123abc-js",
      "burton",
      "womens",
    ]);
  });

  it("hyphenates every garment name", () => {
    expect(generalTags({ type: "Snow Pants", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("snow-pants");
    expect(generalTags({ type: "Down Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toContain("down-jackets");
    expect(generalTags({ type: "Rainwear", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("rainwear");
    expect(TAG_SPELLING).toEqual({});
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

describe("tags Shopify maintains for itself", () => {
  it("recognises price bands, sizes and colours", () => {
    for (const tag of ["500-600", "100-200", "under-50", "size-medium", "size-9", "colour-true-black", "color-black"]) {
      expect(isShopifyGenerated(tag), tag).toBe(true);
    }
  });

  it("leaves the shop's own tags alone", () => {
    for (const tag of ["snow-jackets", "burton", "2026", "123abc-js", "mens", "clearance", "snow-sale"]) {
      expect(isShopifyGenerated(tag), tag).toBe(false);
    }
  });

  it("does not mistake a year or a model number for a price band", () => {
    expect(isShopifyGenerated("2026")).toBe(false);
    expect(isShopifyGenerated("step-on-boots")).toBe(false);
  });

  it("strips them from a list in one go", () => {
    expect(withoutGenerated(["snow-jackets", "size-medium", "burton", "500-600", "colour-true-black"]))
      .toEqual(["snow-jackets", "burton"]);
  });

  it("never writes one itself", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" });
    expect(tags.filter(isShopifyGenerated)).toEqual([]);
  });
});

describe("tags a person applies by hand", () => {
  it("knows the sale and stocktake tags", () => {
    for (const tag of ["snow sale", "snow-sale", "clearance", "snow clearance", "bonus10", "bonus15", "scan"]) {
      expect(isManualTag(tag), tag).toBe(true);
    }
  });

  it("does not mistake a product tag for a promotion", () => {
    for (const tag of ["snow-jackets", "snowboards", "burton", "mens", "2026", "snow-socks"]) {
      expect(isManualTag(tag), tag).toBe(false);
    }
  });

  it("treats Shopify's and the shop's own hand-applied tags as equally off limits", () => {
    expect(isNotOurs("size-medium")).toBe(true);
    expect(isNotOurs("clearance")).toBe(true);
    expect(isNotOurs("snow-jackets")).toBe(false);
  });

  it("never writes one itself", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["mens"], section: "Clothing" });
    expect(tags.filter(isNotOurs)).toEqual([]);
  });
});

describe("products that do not change from year to year", () => {
  it("carries the evergreen marker instead of a season, never as well", () => {
    const tags = generalTags({ type: "Snowboard Accessories", vendor: "Burton", genders: [], evergreen: true, section: "Snowboard" });
    expect(tags).toContain(EVERGREEN_SEASON);
    expect(tags).not.toContain("2026");
    expect(tags).not.toContain("2027");
    expect(tags.filter((t) => /^\d{4}$/.test(t))).toEqual([EVERGREEN_SEASON]);
  });

  it("applies to any kind of product, not just accessories", () => {
    // Three pairs of boots in the shop's own catalogue are evergreen.
    const tags = generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["womens"], evergreen: true });
    expect(tags).toContain(EVERGREEN_SEASON);
    expect(tags).not.toContain("2027");
  });

  it("is a judgement, so it is never learned as a brand convention", () => {
    expect(isManualTag(EVERGREEN_SEASON)).toBe(true);
    expect(isNotOurs(EVERGREEN_SEASON)).toBe(true);
  });

  it("still seasons a normal product", () => {
    expect(generalTags({ type: "Snowboard Accessories", vendor: "Burton", genders: [], section: "Snowboard" })).toContain("2026");
  });
});
