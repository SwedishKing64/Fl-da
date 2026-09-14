import { describe, expect, it } from "vitest";
import {
  analyseShopifyCsv,
  analyseShopifyCsvGroups,
  applyTemplates,
  describeTemplate,
  matchingTemplates,
  templateGuidance,
  type ProductTemplateLike,
} from "./templates";

/** A Shopify export shaped the way a real one is: product fields only on a handle's first row. */
const EXPORT = [
  `Handle,Title,Body (HTML),Vendor,Type,Tags,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Price,SEO Title,SEO Description,Collection,Season (product.metafields.ski.season),Gender (product.metafields.ski.gender),Length (product.metafields.ski.length_cm)`,
  `bent-90,Atomic Bent 90 Skis,<p>Playful all-mountain ski.</p>,Atomic,Skis,"Skis, Atomic, All-Mountain, 2026",Length,166,Colour,Blue/Black,AA0029-166,999.00,Atomic Bent 90 Skis | Alpsport,Playful all-mountain skis.,Skis,2026,Unisex,166`,
  `bent-90,,,,,,Length,172,Colour,Blue/Black,AA0029-172,999.00,,,,,,172`,
  `maverick-88,Atomic Maverick 88 Skis,<p>Everyday carver.</p>,Atomic,Skis,"Skis, Atomic, All-Mountain, 2026",Length,169,Colour,Green,AA0031-169,899.00,Atomic Maverick 88 Skis | Alpsport,Everyday carving skis.,Skis,2026,Mens,169`,
  `bent-100,Atomic Bent 100 Skis,<p>Wider sibling.</p>,Atomic,Skis,"Skis, Atomic, Freeride, 2026",Length,172,Colour,Red,AA0040-172,1099.00,Atomic Bent 100 Skis | Alpsport,Freeride skis.,Skis,2026,Unisex,172`,
].join("\n");

describe("learning a template from a Shopify export", () => {
  const analysis = analyseShopifyCsv(EXPORT);

  it("counts products, not variant rows", () => {
    expect(analysis.productCount).toBe(3);
  });

  it("picks up the vendor and product type everything shares", () => {
    expect(analysis.vendor).toBe("Atomic");
    expect(analysis.productType).toBe("Skis");
  });

  it("keeps the tags on most products and drops the occasional one", () => {
    // Written in the house spelling, not whatever capitalisation the export happened to use.
    expect(analysis.commonTags).toEqual(expect.arrayContaining(["skis", "atomic", "2026"]));
    expect(analysis.commonTags).not.toContain("freeride");
    expect(analysis.tagCounts.find((t) => t.tag === "freeride")?.count).toBe(1);
    expect(analysis.tagCounts.find((t) => t.tag === "all-mountain")?.count).toBe(2);
  });

  it("learns the collection and what the options are called", () => {
    expect(analysis.collections).toEqual(["Skis"]);
    expect(analysis.optionNames).toEqual(["Length", "Colour"]);
  });

  it("keeps a metafield value everything shares and skips one that varies", () => {
    expect(analysis.metafields.season).toBe("2026");
    expect(analysis.metafields.length_cm).toBeUndefined();
    expect(analysis.metafields.gender).toBeUndefined(); // 2 of 3 is not near-unanimous, so it is not a safe default
    expect(analysis.metafieldKeys).toEqual(["gender", "length_cm", "season"]);
  });

  it("keeps examples of the house writing style", () => {
    expect(analysis.titleExamples[0]).toBe("Atomic Bent 90 Skis");
    expect(analysis.seoTitleExample).toBe("Atomic Bent 90 Skis | Alpsport");
    expect(analysis.bodyExample).toContain("Playful all-mountain ski");
  });

  it("says so rather than silently learning nothing", () => {
    expect(analyseShopifyCsv("Name,Price\nThing,10").warnings[0]).toMatch(/Handle/);
    expect(analyseShopifyCsv("").warnings[0]).toMatch(/no data rows/);
  });
});

const brandTemplate: ProductTemplateLike = {
  id: "t1", name: "Atomic", scope: "BRAND", matchValue: "Atomic", productType: "Skis",
  tags: ["Atomic", "2026"], collections: ["Skis"], optionNames: ["Length", "Colour"],
  metafields: { season: "2026" }, priority: 0, active: true,
};
const typeTemplate: ProductTemplateLike = {
  id: "t2", name: "Boots", scope: "PRODUCT_TYPE", matchValue: "Ski Boots", productType: "Ski Boots",
  tags: ["Boots"], collections: ["Ski Boots"], optionNames: ["Size"],
  metafields: { season: "2027" }, priority: 0, active: true,
};

describe("applying templates", () => {
  const base = { vendor: "Atomic", productType: "", category: "skis", tags: ["Skis"], collections: [], metafields: {} };

  it("adds the brand's conventions without removing what is already there", () => {
    const out = applyTemplates(base, [brandTemplate]);
    expect(out.tags).toEqual(["Skis", "Atomic", "2026"]);
    expect(out.collections).toEqual(["Skis"]);
    expect(out.productType).toBe("Skis");
    expect(out.metafields).toEqual({ season: "2026" });
    expect(out.optionNames).toEqual(["Length", "Colour"]);
  });

  it("never overwrites a product type, metafield or option name already set by hand", () => {
    const out = applyTemplates(
      { ...base, productType: "Powder Skis", metafields: { season: "2025" }, optionNames: ["Size"] },
      [brandTemplate],
    );
    expect(out.productType).toBe("Powder Skis");
    expect(out.metafields.season).toBe("2025");
    expect(out.optionNames).toEqual(["Size"]);
  });

  it("does not duplicate a tag that differs only in case", () => {
    const out = applyTemplates({ ...base, tags: ["atomic"] }, [brandTemplate]);
    expect(out.tags).toEqual(["atomic", "2026"]);
  });

  it("ignores templates for other brands and inactive ones", () => {
    expect(applyTemplates({ ...base, vendor: "Volkl" }, [brandTemplate]).applied).toHaveLength(0);
    expect(applyTemplates(base, [{ ...brandTemplate, active: false }]).applied).toHaveLength(0);
  });

  it("lets the more specific template win where two disagree", () => {
    const product = { vendor: "Atomic", productType: "Ski Boots", category: "boots", tags: [], collections: [], metafields: {} };
    const out = applyTemplates(product, [typeTemplate, brandTemplate]);
    expect(out.applied.map((t) => t.id)).toEqual(["t1", "t2"]); // brand first, product type last
    expect(out.metafields.season).toBe("2026"); // the brand got there first and is not overwritten
    expect(out.tags).toEqual(["Atomic", "2026", "Boots"]);
  });

  it("matches on the right field for each scope", () => {
    const target = { vendor: "Atomic", productType: "Ski Boots", category: "boots" };
    expect(matchingTemplates(target, [brandTemplate, typeTemplate]).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(matchingTemplates({ ...target, vendor: "Volkl" }, [brandTemplate, typeTemplate]).map((t) => t.id)).toEqual(["t2"]);
  });

  it("stays off other product types when a brand template is narrowed to one", () => {
    // Learned from a skis-only export: it must not tag the same brand's beanies as Skis.
    const skisOnly = { ...brandTemplate, matchProductType: "Skis" };
    const beanie = { vendor: "Atomic", productType: "Accessories", category: "accessories", tags: ["Beanies"], collections: [], metafields: {} };
    const out = applyTemplates(beanie, [skisOnly]);
    expect(out.applied).toHaveLength(0);
    expect(out.tags).toEqual(["Beanies"]);
    expect(out.collections).toEqual([]);
    expect(out.metafields).toEqual({});

    const ski = { vendor: "Atomic", productType: "Skis", category: "skis", tags: [], collections: [], metafields: {} };
    expect(applyTemplates(ski, [skisOnly]).tags).toEqual(["Atomic", "2026"]);
  });

  it("summarises what a template does", () => {
    expect(describeTemplate(brandTemplate)).toBe("type Skis, 2 tags, 1 collection, 1 metafield, options Length / Colour");
  });
});

/** A whole-catalogue export: two brands, three ranges, and one range too small to learn from. */
const CATALOGUE = [
  `Handle,Title,Vendor,Type,Tags,Option1 Name,Option1 Value,Variant SKU,Collection`,
  // Atomic skis — four products, a real convention
  `a1,Atomic Bent 90,Atomic,Skis,"Skis, Atomic",Length,166,A1,Skis`,
  `a2,Atomic Bent 100,Atomic,Skis,"Skis, Atomic",Length,172,A2,Skis`,
  `a3,Atomic Maverick 88,Atomic,Skis,"Skis, Atomic",Length,169,A3,Skis`,
  `a4,Atomic Redster Q9,Atomic,Skis,"Skis, Atomic",Length,165,A4,Skis`,
  // Atomic boots — three products, just enough
  `a5,Atomic Hawx 90,Atomic,Ski Boots,"Boots, Atomic",Size,26.5,A5,Ski Boots`,
  `a6,Atomic Hawx 100,Atomic,Ski Boots,"Boots, Atomic",Size,27.5,A6,Ski Boots`,
  `a7,Atomic Hawx 110,Atomic,Ski Boots,"Boots, Atomic",Size,28.5,A7,Ski Boots`,
  // Burton boards — three products
  `b1,Burton Custom,Burton,Snowboards,"Snowboards, Burton",Length,156,B1,Snowboards`,
  `b2,Burton Process,Burton,Snowboards,"Snowboards, Burton",Length,158,B2,Snowboards`,
  `b3,Burton Deep Thinker,Burton,Snowboards,"Snowboards, Burton",Length,157,B3,Snowboards`,
  // A lone beanie — one product is not a convention
  `a8,Atomic Alps Beanie,Atomic,Accessories,"Accessories, Atomic",Size,One,A8,Accessories`,
].join("\n");

describe("splitting a whole-catalogue export", () => {
  const { groups, warnings } = analyseShopifyCsvGroups(CATALOGUE);

  it("proposes one template per brand and product type, biggest range first", () => {
    expect(groups.map((g) => `${g.vendor}/${g.productType}`)).toEqual([
      "Atomic/Skis",
      "Atomic/Ski Boots",
      "Burton/Snowboards",
    ]);
    expect(groups[0].analysis.productCount).toBe(4);
  });

  it("learns each range separately rather than blending them", () => {
    const skis = groups.find((g) => g.productType === "Skis")!.analysis;
    const boots = groups.find((g) => g.productType === "Ski Boots")!.analysis;
    expect(skis.commonTags).toEqual(expect.arrayContaining(["skis", "atomic"]));
    expect(skis.commonTags).not.toContain("boots");
    expect(skis.optionNames).toEqual(["Length"]);
    expect(boots.optionNames).toEqual(["Size"]);
    expect(boots.collections).toEqual(["Ski Boots"]);
  });

  it("drops a range too small to tell a convention from a coincidence, and says so", () => {
    expect(groups.some((g) => g.productType === "Accessories")).toBe(false);
    expect(warnings.join(" ")).toMatch(/1 product sat in groups of fewer than 3/);
  });

  it("still reports a file that is not an export at all", () => {
    expect(analyseShopifyCsvGroups("Name,Price\nThing,10").warnings[0]).toMatch(/Handle/);
    expect(analyseShopifyCsvGroups("").groups).toEqual([]);
  });
});

describe("the guidance a person writes", () => {
  const noted: ProductTemplateLike = { ...brandTemplate, matchProductType: "Skis", notes: "Lead the title with the model year." };
  const target = { vendor: "Atomic", productType: "Skis", category: "skis" };

  it("carries house rules, matching notes and the house title style", () => {
    const text = templateGuidance(target, [noted], "Australian spelling.", ["Atomic Bent 90 Skis"]);
    expect(text).toContain("Australian spelling.");
    expect(text).toContain("Lead the title with the model year.");
    expect(text).toContain("Atomic Bent 90 Skis");
  });

  it("leaves out notes from a template this product does not match", () => {
    const beanie = { vendor: "Atomic", productType: "Accessories", category: "accessories" };
    expect(templateGuidance(beanie, [noted])).not.toContain("model year");
  });

  it("is empty when nobody has written anything", () => {
    expect(templateGuidance(target, [brandTemplate])).toBe("");
  });
});

describe("learned tags are written in the house spelling", () => {
  const OLD = [
    `Handle,Title,Vendor,Type,Tags,Variant SKU`,
    `a,Wax One,Swix,Ski Accessories,"ski tuning, ski, Swix",S1`,
    `b,Wax Two,Swix,Ski Accessories,"ski tuning, ski, Swix",S2`,
    `c,Wax Three,Swix,Ski Accessories,"ski tuning, ski, Swix",S3`,
  ].join("\n");

  /**
   * The catalogue's older products spell these with spaces. Learning that verbatim would put a
   * second, almost identical tag on every new product beside the hyphenated one the importer
   * writes, and only one of the two would match the page.
   */
  it("hyphenates a spaced tag it read from an old export", () => {
    const { groups } = analyseShopifyCsvGroups(OLD);
    expect(groups[0].analysis.commonTags).toContain("ski-tuning");
    expect(groups[0].analysis.commonTags).not.toContain("ski tuning");
  });

  it("leaves an already-correct tag alone", () => {
    const { groups } = analyseShopifyCsvGroups(OLD);
    expect(groups[0].analysis.commonTags).toContain("swix");
    expect(groups[0].analysis.commonTags).toContain("ski");
  });
});
