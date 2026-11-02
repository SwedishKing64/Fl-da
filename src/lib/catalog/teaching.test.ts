import { describe, expect, it } from "vitest";
import { AREAS, buildAreas, countBeliefs, EXPORT_RULE_PREFIX, kindFor, type TeachingInput } from "./teaching";
import { DEFAULT_HOUSE } from "./house";

const input = (over: Partial<TeachingInput> = {}): TeachingInput => ({
  house: DEFAULT_HOUSE,
  learned: null,
  website: null,
  types: [],
  tagRules: [],
  templates: [],
  pricingRules: [],
  suppliers: [],
  layouts: [],
  records: [],
  settings: { seoTone: "Plain.", seoTitlePattern: "", defaultRoundTo: "0.99", minMarginPct: 20, gstRate: 0.1, pricesIncludeGst: true, houseRules: "", taxName: "GST" },
  fieldLabels: { sku: "SKU", costPrice: "Cost price" },
  optionPlan: (type) => (type === "Skis" ? ["Length", "Binding Option"] : type === "Jackets" ? ["Size", "Colour"] : []),
  shopName: "Alpine Edge",
  ...over,
});

describe("what Flöda believes, by area", () => {
  it("has the seven areas in order, each with a belief, for a shop that has said nothing", () => {
    const areas = buildAreas(input());
    expect(areas.map((a) => a.key)).toEqual(AREAS.map((a) => a.key));
    for (const a of areas) expect(a.beliefs.length).toBeGreaterThan(0);
    const filing = areas.find((a) => a.key === "filing")!;
    expect(filing.beliefs[0].sentence).toMatch(/No product types yet/);
    expect(filing.beliefs[0].edit).toEqual({ kind: "link", href: "#export", label: "Read an export" });
  });

  it("marks where each belief came from and counts the shop's against Flöda's own", () => {
    const areas = buildAreas(input({
      learned: { types: [{ type: "Skis", count: 40, sections: ["snow"] }], sections: ["snow"], spelling: {}, vendors: [], products: 40, file: "skis.csv", learnedAt: "" },
      types: ["Skis"],
      house: { ...DEFAULT_HOUSE, kinds: [{ type: "Skis", calledAs: "Alpine Skis", tags: ["ski"], variesTags: ["mens", "womens"], titleFormat: "Völkl Mantra 88 2026", count: 40 }] },
    }));
    const filing = areas.find((a) => a.key === "filing")!;
    const by = Object.fromEntries(filing.beliefs.map((b) => [b.id, b]));
    expect(by["learned.types"].source).toBe("export");
    expect(by["kind.calledAs.Skis"].sentence).toBe('What your export calls "Skis" is filed as "Alpine Skis".');
    expect(by["kind.tags.Skis"].edit).toEqual({ kind: "kind", type: "Skis", field: "tags", value: "ski", label: "Tags every Alpine Skis product gets" });
    expect(by["kind.varies.Skis"].sentence).toMatch(/some are tagged mens and womens/);
    const titles = areas.find((a) => a.key === "titles")!;
    expect(titles.beliefs.find((b) => b.id === "kind.title.Skis")?.sentence).toBe('Alpine Skis: titles read like "Völkl Mantra 88 2026".');
    const counts = countBeliefs(areas);
    expect(counts.taught).toBeGreaterThan(0);
    expect(counts.floda).toBeGreaterThan(0);
    expect(counts.taught + counts.floda).toBe(areas.reduce((n, a) => n + a.beliefs.length, 0));
  });

  it("says a tag rule, a template and a pricing rule in words, switched off where they are, with the edit that changes them", () => {
    const areas = buildAreas(input({
      tagRules: [
        { id: "t1", name: "brand ~ Burton", matchField: "brand", pattern: "Burton", addTags: "snowboard", addCollections: "", setProductType: "", setMetafields: "{}", priority: 0, active: false },
        { id: "k1", name: "kind: Skis", matchField: "productType", pattern: "^Skis$", addTags: "ski", addCollections: "", setProductType: "", setMetafields: "{}", priority: 50, active: true },
      ],
      templates: [{ id: "p1", name: "Snowboards", scope: "PRODUCT_TYPE", matchValue: "Snowboards", productType: "", tags: ["snowboard"], collections: [], optionNames: ["Length"], metafields: {}, priority: 1, active: true }],
      pricingRules: [
        { id: "r1", name: `${EXPORT_RULE_PREFIX}Burton`, scope: "BRAND", matchValue: "Burton", mode: "MARGIN", percent: 42, roundTo: "0.99", priority: 20, active: true },
        { id: "r2", name: "Default", scope: "DEFAULT", matchValue: "", mode: "MARKUP", percent: 80, roundTo: "NONE", priority: 0, active: false },
      ],
    }));
    const filing = areas.find((a) => a.key === "filing")!;
    const burton = filing.beliefs.find((b) => b.id === "tag:t1")!;
    expect(burton.off).toBe(true);
    expect(burton.sentence).toBe('When the brand contains "Burton": add the tag snowboard.');
    expect(burton.edit?.kind).toBe("tag-rule");
    // A kind's own rule is said by the kind, not twice.
    expect(filing.beliefs.find((b) => b.id === "tag:k1")).toBeUndefined();
    expect(filing.beliefs.find((b) => b.id === "template:p1")?.sentence).toBe("Snowboards: every product is tagged snowboard.");
    const variants = areas.find((a) => a.key === "variants")!;
    expect(variants.beliefs.find((b) => b.id === "template.options:p1")?.sentence).toBe("Snowboards are sold by Length, in that order.");
    const pricing = areas.find((a) => a.key === "pricing")!;
    const r1 = pricing.beliefs.find((b) => b.id === "pricing:r1")!;
    expect(r1.source).toBe("export");
    expect(r1.sentence).toMatch(/Burton/);
    const r2 = pricing.beliefs.find((b) => b.id === "pricing:r2")!;
    expect(r2.off).toBe(true);
    expect(r2.sentence).not.toMatch(/switched off/);
    expect(pricing.beliefs.find((b) => b.id === "setting.ending")?.sentence).toBe("Prices end in .99.");
  });

  it("says what each of the shop's types is sold by from the pack where no template says, and skips a type with no plan", () => {
    const variants = buildAreas(input({ types: ["Skis", "Jackets", "Wax"], learned: { types: [{ type: "Skis", count: 4, sections: [] }, { type: "Jackets", count: 2, sections: [] }, { type: "Wax", count: 1, sections: [] }], sections: [], spelling: {}, vendors: [], products: 7, file: "x.csv", learnedAt: "" } })).find((a) => a.key === "variants")!;
    expect(variants.beliefs.find((b) => b.id === "plan:Skis")?.sentence).toBe("Skis: sold by Length and Binding Option where the lines vary that way.");
    expect(variants.beliefs.find((b) => b.id === "plan:Jackets")?.edit).toMatchObject({ kind: "template", template: { id: "", scope: "PRODUCT_TYPE", matchValue: "Jackets", optionNames: ["Size", "Colour"] } });
    expect(variants.beliefs.find((b) => b.id === "plan:Wax")).toBeUndefined();
  });

  it("shows the SEO title pattern with an example, Flöda's own until the shop sets one", () => {
    const plain = buildAreas(input()).find((a) => a.key === "seo")!.beliefs[0];
    expect(plain.source).toBe("floda");
    expect(plain.sentence).toBe('SEO titles follow "{title} | {shop}": "Talon 22 2026 | Alpine Edge". Cut to 60 characters.');
    const own = buildAreas(input({ settings: { ...input().settings, seoTitlePattern: "{brand} {title} | {shop}" } })).find((a) => a.key === "seo")!.beliefs[0];
    expect(own.source).toBe("you");
    expect(own.sentence).toMatch(/"Osprey Talon 22 2026 \| Alpine Edge"/);
  });

  it("says each supplier's defaults with its layouts and record under it", () => {
    const areas = buildAreas(input({
      suppliers: [{ id: "s1", name: "Amer", defaultCurrency: "AUD", defaultGstTreatment: "EXCLUSIVE", defaultBrand: "Atomic" }],
      layouts: [{ id: "l1", supplier: "Amer", name: "Invoice", mappings: { "Item": "sku", "Net": "costPrice" }, options: {} }],
      records: [{ supplierId: "s1", name: "Amer", imports: 3, products: 120, touched: 6, share: 0.95 }],
    }));
    const s = areas.find((a) => a.key === "suppliers")!.beliefs.map((b) => b.id);
    expect(s.slice(0, 3)).toEqual(["supplier:s1", "layout:l1", "record:s1"]);
  });

  it("gives a composer the kind as kept, or a blank one for a type not yet told", () => {
    const kinds = [{ type: "Skis", calledAs: "Skis", tags: ["ski"], titleFormat: "", count: 3 }];
    expect(kindFor(kinds, "skis").tags).toEqual(["ski"]);
    expect(kindFor(kinds, "Boots")).toEqual({ type: "Boots", calledAs: "Boots", tags: [], variesTags: [], titleFormat: "", count: 0 });
  });
});
