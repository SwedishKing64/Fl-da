import { afterEach, describe, expect, it } from "vitest";
import { ALPSPORT_CONVENTIONS, BLANK_CONVENTIONS, SNOW_OUTDOOR_TAXONOMY, activateConventions, productTypes } from "./taxonomy";
import { PACKS, PACK_IDS, packFor } from "./trades";
import { groupLineItems } from "./grouping";
import { emptyLineItem, type CanonicalLineItem } from "./types";
import type { CategoryRuleLike } from "./categorize";

const rule = (category: string, pattern: string, productType: string): CategoryRuleLike => ({ category, pattern, productType, collections: "", tags: "", priority: 1, active: true });
const RULES = [rule("accessories", "glove", "Accessories"), rule("boots", "boot", "Boots")];
const line = (over: Partial<CanonicalLineItem>): CanonicalLineItem => ({ ...emptyLineItem(), quantity: 1, ...over });

afterEach(() => activateConventions(BLANK_CONVENTIONS));

describe("trade packs", () => {
  it("keeps the snow-and-outdoor menu exactly where the engine found it", () => {
    expect(PACKS["snow-outdoor"].tree).toBe(SNOW_OUTDOOR_TAXONOMY);
    activateConventions(ALPSPORT_CONVENTIONS);
    expect(productTypes()).toContain("Skis");
    expect(productTypes()).toContain("Tents");
  });

  it("gives an outdoor shop the outdoor menu without the snow", () => {
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    const kinds = productTypes();
    expect(kinds).toContain("Tents");
    expect(kinds).toContain("Hiking Boots");
    expect(kinds).toContain("Outdoor Clothing");
    expect(kinds).not.toContain("Skis");
    expect(kinds).not.toContain("Snow Jackets");
    expect(PACKS.outdoor.tagSpelling["2 Person Tents"]).toBe("2 person tents");
    expect(PACKS.outdoor.tagSpelling["Carving Skis"]).toBeUndefined();
  });

  it("knows no kinds at all on a blank shop", () => {
    activateConventions(BLANK_CONVENTIONS);
    expect(productTypes()).toEqual([]);
  });

  it("falls back to no pack for an id it does not know", () => {
    expect(packFor("surfboards").id).toBe("general");
    expect(packFor(undefined).id).toBe("general");
  });

  it("offers every pack at setup, none first, and only the snow pack seeds rules", () => {
    expect(PACK_IDS[0]).toBe("general");
    expect(PACK_IDS.filter((id) => PACKS[id].seeds)).toEqual(["snow-outdoor"]);
  });
});

describe("the ski and snowboard rules", () => {
  const glove = line({ brand: "Burton", title: "Profile Glove", sku: "G1", size: "M" });
  const boot = line({ brand: "Burton", title: "Trail Boot", sku: "B1", size: "9" });

  it("file a ski shop's glove under Ski Accessories and a Burton boot as a snowboard boot", () => {
    activateConventions(ALPSPORT_CONVENTIONS);
    const [g] = groupLineItems([glove], RULES);
    const [b] = groupLineItems([boot], RULES);
    expect(g.productType).toBe("Ski Accessories");
    expect(b.productType).toBe("Snowboard Boots");
  });

  it("stay out of an outdoor shop: a glove is not a ski accessory, a boot is not a snowboard boot", () => {
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    const [g] = groupLineItems([glove], RULES);
    const [b] = groupLineItems([boot], RULES);
    expect(g.productType).not.toMatch(/ski|snowboard/i);
    expect(b.productType).toBe("Boots");
  });

  it("apply to a shop with no pack once its own store shows it sells skis", () => {
    activateConventions({ ...BLANK_CONVENTIONS, learned: { types: [{ type: "Skis", count: 12, sections: [] }, { type: "Gloves", count: 30, sections: [] }], sections: [], spelling: {}, vendors: [], products: 42, file: "export.csv", learnedAt: "2026-10-22" } });
    const [b] = groupLineItems([boot], RULES);
    expect(b.productType).toBe("Snowboard Boots");
  });
});

describe("options from the supplier's own columns", () => {
  const bag = (sku: string, length: string, zip: string, line: string): CanonicalLineItem =>
    ({ ...emptyLineItem(), brand: "Sea to Summit", title: "Spark Sleeping Bag", sku, quantity: 1, variant: length, variantName: "Length", extras: { "Zip Side": zip, "Line No": line, "Unit Price": "399.00" } });

  it("takes a kept column as an option where two lines would otherwise be the same variant", () => {
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    const [p] = groupLineItems([bag("S1", "Regular", "Left", "1"), bag("S2", "Regular", "Right", "2"), bag("S3", "Long", "Left", "3"), bag("S4", "Long", "Right", "4")], []);
    expect([p.option1Name, p.option2Name, p.option3Name]).toEqual(["Length", "Zip Side", null]);
    expect(p.variants.map((v) => `${v.option1Value}/${v.option2Value}`)).toEqual(["Regular/Left", "Regular/Right", "Long/Left", "Long/Right"]);
  });

  it("leaves the kept columns alone where the options already tell the lines apart", () => {
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    const [p] = groupLineItems([bag("S1", "Regular", "Left", "1"), bag("S3", "Long", "Right", "3")], []);
    expect([p.option1Name, p.option2Name]).toEqual(["Length", null]);
  });
});
