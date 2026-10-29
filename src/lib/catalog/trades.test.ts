import { afterEach, describe, expect, it } from "vitest";
import { SNOW_TEST_CONVENTIONS, BLANK_CONVENTIONS, SNOW_OUTDOOR_TAXONOMY, activateConventions, productTypes } from "./taxonomy";
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
    activateConventions(SNOW_TEST_CONVENTIONS);
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
    // Tag spellings are the shop's own, learned from its store, never another shop's.
    expect(PACKS.outdoor.tagSpelling).toEqual({});
  });

  it("knows no kinds at all on a blank shop", () => {
    activateConventions(BLANK_CONVENTIONS);
    expect(productTypes()).toEqual([]);
  });

  it("falls back to no pack for an id it does not know", () => {
    expect(packFor("surfboards").id).toBe("general");
    expect(packFor(undefined).id).toBe("general");
  });

  it("offers every pack at setup, none first, and no pack seeds rules", () => {
    expect(PACK_IDS[0]).toBe("general");
    expect(PACK_IDS.filter((id) => PACKS[id].seeds)).toEqual([]);
  });
});

describe("the ski and snowboard rules", () => {
  const glove = line({ brand: "Burton", title: "Profile Glove", sku: "G1", size: "M" });
  const boot = line({ brand: "Burton", title: "Trail Boot", sku: "B1", size: "9" });

  it("file a ski shop's glove under Ski Accessories and a Burton boot as a snowboard boot", () => {
    activateConventions(SNOW_TEST_CONVENTIONS);
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

describe("product metafields", () => {
  it("stay under ski for the ski shop, and are custom and trade-neutral for every other shop", async () => {
    const { metafieldDefs } = await import("./taxonomy");
    const { metafieldsFor, metafieldColumns } = await import("./categorize");
    const tent = { ...emptyLineItem(), title: "Ridgeback Tent", length: "210", gender: "Unisex", modelCode: "RB2" };
    activateConventions(SNOW_TEST_CONVENTIONS);
    expect(metafieldDefs().every((d) => d.namespace === "ski")).toBe(true);
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    expect(metafieldDefs().map((d) => d.namespace)).toEqual(["custom", "custom", "custom"]);
    expect(Object.keys(metafieldColumns(metafieldsFor([tent])))).toEqual(["Gender (product.metafields.custom.gender)", "Model Code (product.metafields.custom.model_code)"]);
  });
});

describe("a ski's own fields", () => {
  it("are offered to a column only in the snow trade; elsewhere the column is kept as a trait", async () => {
    const { suggestMapping, applyMapping } = await import("./mapping");
    const headers = ["SKU", "Name", "Flex", "Terrain", "Qty", "Cost"];
    const rows = [{ SKU: "B1", Name: "Ridge Bike", Flex: "Stiff", Terrain: "Gravel", Qty: "1", Cost: "900" }];
    activateConventions(SNOW_TEST_CONVENTIONS);
    expect(suggestMapping(headers, rows)).toMatchObject({ Flex: "flex", Terrain: "terrain" });
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    const mapping = suggestMapping(headers, rows);
    expect(mapping.Flex || "").toBe("");
    expect(mapping.Terrain || "").toBe("");
    expect(applyMapping(rows[0], mapping).extras).toMatchObject({ Flex: "Stiff", Terrain: "Gravel" });
  });

  it("are not asked of the reader outside the snow trade, whose instructions carry no ski examples", async () => {
    const { readerInstructions } = await import("./extract/ai");
    const trade = readerInstructions(false);
    for (const word of ["Volkl", "Sportrade", "RACETIGER", "flex, abilityLevel", "DIN", "SLR 10", "148cm", "Bent 100"]) expect(trade).not.toContain(word);
    expect(readerInstructions(true)).toContain("RACETIGER");
  });

  it("give way to the specs the reader read, kept under the document's own names", async () => {
    const { aiExtractionToTable, readerMapping, isReaderTable } = await import("./extract/ai");
    const { applyMapping } = await import("./mapping");
    const line = { title: "Trail 900 Lamp", brand: "Lumo", modelCode: "", sku: "TL900", barcode: "", costPrice: 40, currency: "", quantity: 2, rrp: 89.95, length: "", size: "", width: "", colour: "Black", variant: "", variantName: "", productType: "", gender: "", season: "", category: "lamps", description: "", tags: "", imageUrls: [], notes: "", specs: [{ name: "Lumens", value: "900" }, { name: "Battery", value: "USB-C" }] };
    const table = aiExtractionToTable({ documentType: "INVOICE", summary: "", supplier: "", invoiceNumber: "", currency: "", gstTreatment: "EXCLUSIVE", statedTotals: { units: null, subtotal: null }, items: [line] }, "PDF_AI");
    expect(isReaderTable(table.headers)).toBe(true);
    const item = applyMapping(table.rows[0], readerMapping(table.headers));
    expect(item.sku).toBe("TL900");
    expect(item.extras).toMatchObject({ Lumens: "900", Battery: "USB-C" });
  });
});

describe("a shop that sells more than one trade", () => {
  it("starts from every pack it ticked, laid together", () => {
    const both = packFor("outdoor+snow-outdoor");
    expect(both.id).toBe("outdoor+snow-outdoor");
    expect(both.snowRules).toBe(true);
    expect(both.fillsCategory).toBe(true);
    const tops = both.tree.map((s) => s.top);
    expect(new Set(tops).size).toBe(tops.length);
    expect(tops).toEqual(expect.arrayContaining(["Outdoor", "Ski"]));
    expect(packFor("outdoor+surfboards").id).toBe("outdoor");
  });

  it("is checked as a set of known packs", async () => {
    const { isPackSet } = await import("./trades");
    expect(isPackSet("general")).toBe(true);
    expect(isPackSet("outdoor+snow-outdoor")).toBe(true);
    expect(isPackSet("outdoor+surfboards")).toBe(false);
    expect(isPackSet("")).toBe(false);
  });
});
