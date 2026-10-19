import { describe, expect, it } from "vitest";
import { buildRulebook, countRules, describeLayout, describePricingRule, describeTagRule, STAGES, type RulebookInput } from "./rulebook";
import { DEFAULT_HOUSE } from "./house";

const input = (over: Partial<RulebookInput> = {}): RulebookInput => ({
  house: DEFAULT_HOUSE,
  tagRules: [],
  templates: [],
  pricingRules: [],
  layouts: [],
  suppliers: [],
  records: [],
  website: null,
  learned: null,
  settings: { minMarginPct: 20, defaultRoundTo: "0.99", gstRate: 0.1, pricesIncludeGst: true, seoTone: "Plain.", houseRules: "", taxName: "GST" },
  pictureHosting: true,
  fieldLabels: { sku: "SKU", costPrice: "Cost price", title: "Product name", brand: "Brand / vendor" },
  ...over,
});

describe("rules in words", () => {
  it("says what a tag rule does and when", () => {
    expect(describeTagRule({ id: "1", name: "x", matchField: "brand", pattern: "Burton", addTags: "snowboard, burton", addCollections: "", setProductType: "", setMetafields: "{}", priority: 0, active: true }))
      .toBe('When the brand contains "Burton": add the tags snowboard, burton.');
    expect(describeTagRule({ id: "2", name: "kind: Skis", matchField: "productType", pattern: "^Skis$", addTags: "ski", addCollections: "", setProductType: "Alpine Skis", setMetafields: "{}", priority: 50, active: false }))
      .toBe('When the type is exactly "Skis": add the tag ski; file it as "Alpine Skis". (switched off)');
    expect(describeTagRule({ id: "3", name: "Women", matchField: "any", pattern: String.raw`\b(women'?s|womens|ladies)\b`, addTags: "womens", addCollections: "Womens", setProductType: "", setMetafields: JSON.stringify({ "Terrain (product.metafields.ski.terrain)": "Freeride" }), priority: 0, active: true }))
      .toBe('When anything about the product says "women\'s" or "womens" or "ladies": add the tag womens; put it in Womens; set Terrain to "Freeride".');
  });
  it("says what a pricing rule and a layout do", () => {
    expect(describePricingRule({ id: "p", name: "", scope: "BRAND", matchValue: "Burton", mode: "MARGIN", percent: 40, roundTo: "0.99", priority: 0, active: true })).toBe("Burton: 40% margin on the ex-GST price, ending in 0.99.");
    expect(describePricingRule({ id: "p", name: "", scope: "DEFAULT", matchValue: "", mode: "MARKUP", percent: 60, roundTo: "NONE", priority: 0, active: false })).toBe("Everything else: 60% markup on the landed cost, not rounded. (switched off)");
    expect(describeLayout({ id: "l", supplier: "Burton", name: "XLSX layout", mappings: { Item: "sku", "W/S": "costPrice", Notes: "" }, options: { fixed: { brand: "Burton" }, costIsLineTotal: true } }, input().fieldLabels))
      .toBe('Burton, XLSX layout: "Item" is the SKU, "W/S" is the cost price; 1 column ignored; costs are line totals, divided by the quantity; brand / vendor is always "Burton".');
    expect(describeLayout({ id: "l", supplier: "Burton", name: "Burton – XLSX layout", mappings: { Item: "sku" }, options: {} }, input().fieldLabels)).toBe('Burton – XLSX layout: "Item" is the SKU.');
  });
});

describe("the rulebook", () => {
  it("has every stage, with Flöda's own rules counted apart from the shop's", () => {
    const book = buildRulebook(input());
    expect(book.map((s) => s.key)).toEqual(STAGES.map((s) => s.key));
    for (const s of book) expect(s.rules.length).toBeGreaterThan(0);
    const counts = countRules(book);
    expect(counts.floda).toBeGreaterThan(5);
    expect(counts.shop).toBeGreaterThan(5);
  });
  it("puts each store in its stage, and a kind's tag rule under the kind rather than twice", () => {
    const book = buildRulebook(input({
      tagRules: [
        { id: "k", name: "kind: Skis", matchField: "productType", pattern: "^Skis$", addTags: "ski", addCollections: "", setProductType: "", setMetafields: "{}", priority: 50, active: true },
        { id: "h", name: "house: 1", matchField: "brand", pattern: "Völkl", addTags: "volkl", addCollections: "", setProductType: "", setMetafields: "{}", priority: 0, active: true },
      ],
      house: { ...DEFAULT_HOUSE, kinds: [{ type: "Skis", calledAs: "Alpine Skis", tags: ["ski"], titleFormat: "Völkl Mantra 88 2026", count: 3 }] },
      suppliers: [{ id: "s", name: "Sportrade", defaultCurrency: "AUD", defaultGstTreatment: "EXCLUSIVE", defaultBrand: "Völkl" }],
      pricingRules: [{ id: "p", name: "", scope: "DEFAULT", matchValue: "", mode: "MARGIN", percent: 40, roundTo: "0.99", priority: 0, active: true }],
    }));
    const by = Object.fromEntries(book.map((s) => [s.key, s.rules]));
    expect(by.reading.some((r) => r.sentence.startsWith("Sportrade: costs in AUD, exclusive of GST, the brand is Völkl"))).toBe(true);
    expect(by.naming.some((r) => r.sentence.includes('titles read like "Völkl Mantra 88 2026"'))).toBe(true);
    expect(by.filing.filter((r) => r.tagRuleId).map((r) => r.tagRuleId)).toEqual(["h"]);
    expect(by.filing.find((r) => r.tagRuleId === "h")?.editHref).toBe("/training#house");
    expect(by.filing.some((r) => r.sentence.includes('what an export calls "Skis" is filed as "Alpine Skis"'))).toBe(true);
    expect(by.pricing[0].sentence).toBe("Everything else: 40% margin on the ex-GST price, ending in 0.99.");
  });
});
