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
      expect(result.products.flatMap((p) => p.variants.map((v) => ({ sku: v.sku, landedCostAud: v.landedCostAud, retailPrice: v.retailPrice, exGstRevenue: v.exGstRevenue, gstComponent: v.gstComponent, profitPerUnit: v.profitPerUnit, marginPct: v.marginPct })))).toEqual(expectedProfit[name].variants);
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
    const skis = products.find((p) => p.handle === "atomic-bent-90-skis")!;
    expect(skis.option1Name).toBe("Length");
    expect(skis.variants.map((v) => v.option1Value)).toEqual(["166", "172", "178"]);
    // The supplier's recommended retail is the price. Nothing adjusts it.
    expect(skis.variants[0].retailPrice).toBe(999);
    expect(skis.variants[0].compareAtPrice).toBeNull(); // nothing to strike through at full price
    expect(skis.variants[0].profitPerUnit).toBe(458.18); // 908.18 ex-GST revenue − 450 landed
    const beanie = products.find((p) => p.handle === "atomic-alps-beanie")!;
    expect(beanie.variants[0].retailPrice).toBe(29.95);
    expect(summary.totalNetProfit).toBe(4863.66);
    expect(summary.totalGst).toBe(940.74);
  });

  it("volkl: USD invoice with line totals, no GST, freight by value", () => {
    const { products } = fixtures.results.volkl;
    const mantra = products.find((p) => p.handle === "volkl-m6-mantra")!;
    expect(mantra.variants).toHaveLength(3);
    expect(mantra.variants[0].sku).toBe("V2410170");
    expect(mantra.variants[0].costPrice).toBe(550); // 1100 line total / 2 pieces
    expect(mantra.variants[0].landedCostAud).toBeGreaterThan(550 * 1.52); // FX plus freight share
    const griffon = products.find((p) => p.handle === "marker-griffon-13-id-bindings")!;
    // Colour leads on a binding, as it does on all twenty in the catalogue.
    expect(griffon.option1Name).toBe("Colour");
    expect(griffon.option2Name).toBe("Size");
    expect(griffon.variants.map((v) => v.option2Value)).toEqual(["100", "110"]);
  });

  it("burton: GST-inclusive text invoice backs GST out of the cost", () => {
    const { products } = fixtures.results.burton;
    const board = products.find((p) => p.handle === "burton-custom-snowboard")!;
    expect(board.variants[0].landedCostAud).toBe(425); // 462 inc GST => 420 ex + 5 freight
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
