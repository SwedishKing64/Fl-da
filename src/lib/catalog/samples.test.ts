// Regression fixtures: the three sample supplier files in /samples must keep producing exactly
// the expected Shopify CSV and profit figures. Regenerate with `npm run catalog:fixtures` only
// after an intentional pricing/CSV change, and review the diff.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixtures } from "../../../samples/fixtures";
import { extractXlsx } from "./extract/tabular";
import { extractPdfText } from "./extract/pdf";
import { extractHeuristic } from "./extract/heuristic";
import { validateCsvFile } from "./csv";
import { enrichFromSpecs } from "./pipeline";
import type { CanonicalLineItem } from "./types";

/** An empty canonical row, so each test states only the columns it is about. */
const BLANK: CanonicalLineItem = {
  title: "", brand: "", modelCode: "", sku: "", barcode: "", costPrice: null, quantity: null,
  rrp: null, grams: null, length: "", size: "", width: "", colour: "", gender: "", season: "",
  category: "", productType: "", description: "", flex: "", abilityLevel: "", dinRange: "",
  terrain: "", imageUrls: [], collections: "", tags: "",
};

const SAMPLES = path.resolve(__dirname, "../../../samples");
const fixtures = buildFixtures();
const expectedProfit = JSON.parse(readFileSync(path.join(SAMPLES, "expected/profit.json"), "utf8"));

describe("sample invoices → expected Shopify CSV", () => {
  // Only the Atomic sample carries a recommended retail column, and the price is the recommended
  // retail — so it is the only one of the three that can produce a priced CSV at all. That is the
  // point rather than a gap in the fixtures: the other two prove what a costs-only invoice does.
  for (const name of ["atomic"] as const) {
    it(`${name}: CSV matches samples/expected/${name}.shopify.csv and passes the file validator`, () => {
      const result = fixtures.results[name];
      expect(result.errors).toEqual([]);
      expect(validateCsvFile(result.csv)).toEqual([]);
      expect(result.csv).toBe(readFileSync(path.join(SAMPLES, `expected/${name}.shopify.csv`), "utf8"));
    });

    it(`${name}: profit figures match samples/expected/profit.json`, () => {
      const result = fixtures.results[name];
      expect(result.summary).toEqual(expectedProfit[name].summary);
      expect(result.products.flatMap((p) => p.variants.map((v) => ({ sku: v.sku, landedCostHome: v.landedCostHome, retailPrice: v.retailPrice, exGstRevenue: v.exGstRevenue, gstComponent: v.gstComponent, profitPerUnit: v.profitPerUnit, marginPct: v.marginPct })))).toEqual(expectedProfit[name].variants);
      expect(result.warnings).toEqual(expectedProfit[name].warnings);
    });
  }

  for (const name of ["volkl", "burton"] as const) {
    it(`${name}: an invoice with no recommended retail leaves the price column empty`, () => {
      const result = fixtures.results[name];
      const prices = result.products.flatMap((p) => p.variants.map((v) => v.retailPrice));
      expect(prices.every((price) => price === 0)).toBe(true);
      // Said, not enforced: nothing invents a price, and nothing refuses the export over one.
      expect(result.errors).toEqual([]);
      expect(result.warnings.some((w) => w.includes("No recommended retail"))).toBe(true);
      // Empty in the CSV rather than 0.00, which Shopify would read as a free product.
      const priceColumn = result.csv.split("\n")[1].split(",").length;
      expect(priceColumn).toBeGreaterThan(0);
      expect(result.csv).not.toContain(",0.00,");
    });
  }

  it("atomic: the recommended retail is the price, and the profit follows from it", () => {
    const { products, summary } = fixtures.results.atomic;
    const skis = products.find((p) => p.handle === "bent-90-skis-2026")!;
    expect(skis.option1Name).toBe("Length");
    expect(skis.variants.map((v) => v.option1Value)).toEqual(["166", "172", "178"]);
    // The supplier's recommended retail is the price. Nothing adjusts it.
    expect(skis.variants[0].retailPrice).toBe(999);
    expect(skis.variants[0].compareAtPrice).toBeNull(); // nothing to strike through at full price
    expect(skis.variants[0].profitPerUnit).toBe(458.18); // 908.18 ex-GST revenue − 450 landed
    const beanie = products.find((p) => p.handle === "alps-beanie-2026")!;
    expect(beanie.variants[0].retailPrice).toBe(29.95);
    expect(summary.totalNetProfit).toBe(4863.66);
    expect(summary.totalGst).toBe(940.74);
  });

  it("volkl: USD invoice with line totals, no GST, freight by value", () => {
    const { products } = fixtures.results.volkl;
    const mantra = products.find((p) => p.handle === "m6-mantra-2026")!;
    expect(mantra.variants).toHaveLength(3);
    expect(mantra.variants[0].sku).toBe("V2410170");
    expect(mantra.variants[0].costPrice).toBe(550); // 1100 line total / 2 pieces
    expect(mantra.variants[0].landedCostHome).toBeGreaterThan(550 * 1.52); // FX plus freight share
    const griffon = products.find((p) => p.handle === "griffon-13-id-bindings-2026")!;
    // Colour leads on a binding, as it does on all twenty in the catalogue.
    expect(griffon.option1Name).toBe("Colour");
    expect(griffon.option2Name).toBe("Size");
    expect(griffon.variants.map((v) => v.option2Value)).toEqual(["100", "110"]);
  });

  it("burton: GST-inclusive text invoice backs GST out of the cost", () => {
    const { products } = fixtures.results.burton;
    const board = products.find((p) => p.handle === "custom-snowboard-2027")!;
    expect(board.variants[0].landedCostHome).toBe(425); // 462 inc GST => 420 ex + 5 freight
    // The cost is understood; the price is not, because this invoice never stated one.
    expect(board.variants[0].retailPrice).toBe(0);
    // Everything the importer builds is a draft, whatever the invoice was.
    expect(board.status).toBe("draft");
    expect(board.published).toBe(false);
  });
});

describe("sample files parse with the real extractors", () => {
  it("reads the XLSX sample with a preamble above the header", async () => {
    const table = await extractXlsx(readFileSync(path.join(SAMPLES, "volkl-invoice.xlsx")));
    expect(table.headers).toEqual(fixtures.volkl.headers);
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0]["Amount USD"]).toBe("1100");
  });

  it("reads the PDF sample's text layer and finds 5 line items", async () => {
    const pdf = await extractPdfText(readFileSync(path.join(SAMPLES, "burton-invoice.pdf")));
    expect(pdf.looksScanned).toBe(false);
    const table = extractHeuristic(pdf.text);
    expect(table.rows.map((r) => r.SKU)).toEqual(["BUR-CUST-154", "BUR-CUST-158", "BUR-CUST-162", "BUR-CART-M", "BUR-CART-L"]);
  });
});

/**
 * A description that arrives on a supplier's spec sheet.
 *
 * Two faults, both found building a Volkl range. The description was written into the column raw,
 * so it matched none of the 733 products that carry a Tech Specs list. And it was only written at
 * all when the column was empty — which it never is, because building a product puts the invoice's
 * own line there first. Every description on every spec sheet was being dropped.
 */
describe("merging a supplier's spec sheet", () => {
  const product = () => ({
    title: "Mantra M7",
    brand: "Volkl",
    description: "<p>Volkl Mantra M7 ski.</p>",       // what the invoice line leaves behind
    tags: [] as string[],
    imageUrls: [] as string[],
    metafields: {} as Record<string, string>,
    variants: [{ item: { ...BLANK, modelCode: "V2410170", description: "" } }],
  });

  const BLANK_SPEC = { ...BLANK, modelCode: "V2410170", brand: "Volkl", title: "Mantra M7" };

  it("replaces the invoice's one-liner instead of leaving it there", () => {
    const [out] = enrichFromSpecs([product()], [{ ...BLANK_SPEC, description: "A ski that holds an edge on hardpack and floats in soft snow, with enough shape to be turned at any speed." }]);
    expect(out.description).toContain("holds an edge");
    expect(out.description).not.toContain("Volkl Mantra M7 ski.");
  });

  it("writes it in the shop's own shape: a paragraph, then Tech Specs, then the list", () => {
    const [out] = enrichFromSpecs([product()], [{ ...BLANK_SPEC, description: "A ski that holds an edge.", width: "96mm", flex: "Stiff", terrain: "All-mountain" }]);
    expect(out.description).toBe(
      ["<p>A ski that holds an edge.</p>", "<h2>Tech Specs</h2>", "<ul>", "<li>WAIST WIDTH: 96mm</li>", "<li>FLEX: Stiff</li>", "<li>TERRAIN: All-mountain</li>", "</ul>"].join("\n"),
    );
  });

  it("turns the sheet's own columns into the spec list, not just metafields", () => {
    const [out] = enrichFromSpecs([product()], [{ ...BLANK_SPEC, description: "Copy.", length: "177", dinRange: "3-12", abilityLevel: "Advanced", gender: "Mens" }]);
    expect(out.description).toContain("<li>LENGTH: 177</li>");
    expect(out.description).toContain("<li>DIN RANGE: 3-12</li>");
    expect(out.description).toContain("<li>ABILITY: Advanced</li>");
    expect(out.description).toContain("<li>GENDER: Mens</li>");
    expect(out.metafields.din_range).toBe("3-12");   // still reaches the metafield as well
  });

  it("leaves a description somebody actually wrote alone", () => {
    const written = { ...product(), description: "<p>Long copy that a person wrote, well past the length of an invoice line, describing how the ski behaves through a turn and who it suits.</p><h2>Tech Specs</h2><ul><li>WAIST WIDTH: 96mm</li></ul>" };
    const [out] = enrichFromSpecs([written], [{ ...BLANK_SPEC, description: "Supplier copy that should not win." }]);
    expect(out.description).toBe(written.description);
  });

  it("writes no Tech Specs heading when the sheet states no specs", () => {
    const [out] = enrichFromSpecs([product()], [{ ...BLANK_SPEC, description: "Just the copy." }]);
    expect(out.description).toBe("<p>Just the copy.</p>");
    expect(out.description).not.toContain("Tech Specs");
  });
});
