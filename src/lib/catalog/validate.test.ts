import { describe, expect, it } from "vitest";
import { blockingErrors, emptyVariantView, hardErrors, summarise, validateReview } from "./validate";
import type { ReviewProduct } from "./review-types";

function product(partial: Partial<ReviewProduct>): ReviewProduct {
  return {
    id: "p1", handle: "atomic-bent-90", title: "Atomic Bent 90", bodyHtml: "", vendor: "Atomic", productType: "Skis", category: "skis",
    tags: "", collections: "", status: "draft", published: false, seoTitle: "", seoDescription: "", lookupStatus: "NONE", lookupSource: "", matchCandidates: [], matchDecided: false, option1Name: "Length", option2Name: null, option3Name: null,
    metafields: {}, reconcileStatus: "UNKNOWN", shopifyProductId: null, images: [{ id: "i", url: "https://cdn.x.com/a.jpg", position: 1, variantId: null, source: "SUPPLIER", validated: true }],
    variants: [], flags: [], ...partial,
  };
}

describe("review validation", () => {
  it("raises errors for duplicate skus/handles/options, and warns rather than blocks on a missing price", () => {
    const good = emptyVariantView({ id: "v1", productId: "p1", sku: "A-166", option1Value: "166", costPrice: 300, retailPrice: 550, exGstRevenue: 500, gstComponent: 50, landedCostAud: 300, profitPerUnit: 200, marginPct: 40, quantity: 2 });
    const noPrice = emptyVariantView({ id: "v2", productId: "p1", sku: "A-172", option1Value: "172", costPrice: 300 });
    const dupSku = emptyVariantView({ id: "v3", productId: "p1", sku: "a-166", option1Value: "166", costPrice: 300, retailPrice: 330, exGstRevenue: 300, profitPerUnit: 0, marginPct: 0 });
    const p1 = product({ variants: [good, noPrice, dupSku] });
    const p2 = product({ id: "p2", title: "", images: [], variants: [emptyVariantView({ id: "v4", productId: "p2", sku: "B", retailPrice: 10, costPrice: 9, landedCostAud: 9, exGstRevenue: 9.09, profitPerUnit: 0.09, marginPct: 1 })] });
    validateReview([p1, p2], { minMarginPct: 20 });

    expect(good.flags).toEqual([{ code: "DUPLICATE_SKU_BATCH", severity: "error", message: expect.any(String) }, { code: "DUPLICATE_OPTIONS", severity: "error", message: expect.any(String) }]);
    expect(noPrice.flags.map((f) => f.code)).toEqual(["MISSING_PRICE"]);
    expect(dupSku.flags.map((f) => f.code)).toEqual(["DUPLICATE_SKU_BATCH", "DUPLICATE_OPTIONS", "LOW_MARGIN"]);
    // One image is short of the six the shop wants, so every product here says so.
    expect(p1.flags.map((f) => f.code)).toEqual(["DUPLICATE_HANDLE", "FEW_IMAGES"]);
    expect(p2.flags.map((f) => f.code)).toEqual(["MISSING_TITLE", "DUPLICATE_HANDLE", "NO_IMAGE"]);
    expect(p2.variants[0].flags.map((f) => f.code)).toEqual(["MISSING_OPTION_VALUE", "LOW_MARGIN"]);

    const errors = blockingErrors([p1, p2]);
    // One fewer than before: a missing price is a warning now, not a reason to refuse the export.
    expect(errors.length).toBe(8);
    expect(errors.join(" ")).not.toContain("recommended retail");
    const s = summarise([p1, p2]);
    expect(s.products).toBe(2);
    expect(s.variants).toBe(4);
    expect(s.units).toBe(2);
    expect(s.totalNetProfit).toBe(400);
    expect(s.lowMarginVariants).toBe(2);
  });

  it("hides dismissed warnings but never dismissed errors", () => {
    const v = emptyVariantView({ id: "v", productId: "p1", sku: "", retailPrice: 10, costPrice: 9, landedCostAud: 9, exGstRevenue: 9.09, profitPerUnit: 0.09, marginPct: 1, warningsDismissed: ["LOW_MARGIN", "MISSING_SKU"], option1Value: "160" });
    const p = product({ variants: [v] });
    validateReview([p], { minMarginPct: 20 });
    expect(v.flags).toEqual([]);
  });

  it("stops the export on a bad check digit, swapped code columns, a price below cost or a margin no shop earns", () => {
    const base = { productId: "p1", costPrice: 300, retailPrice: 550, exGstRevenue: 500, gstComponent: 50, landedCostAud: 300, profitPerUnit: 200, marginPct: 40 };
    const badDigit = emptyVariantView({ ...base, id: "v1", sku: "A-1", option1Value: "1", barcode: "9312345000127" });
    const swapped = emptyVariantView({ ...base, id: "v2", sku: "9312345000128", option1Value: "2", barcode: "A-2" });
    const shortCode = emptyVariantView({ ...base, id: "v3", sku: "A-3", option1Value: "3", barcode: "2025101512" });
    const belowCost = emptyVariantView({ ...base, id: "v4", sku: "A-4", option1Value: "4", retailPrice: 250, exGstRevenue: 227.27, profitPerUnit: -72.73, marginPct: -32 });
    const tooGood = emptyVariantView({ ...base, id: "v5", sku: "A-5", option1Value: "5", costPrice: 3, landedCostAud: 3, profitPerUnit: 497, marginPct: 99.4 });
    const fine = emptyVariantView({ ...base, id: "v6", sku: "A-6", option1Value: "6", barcode: "9312345000128" });
    const p = product({ variants: [badDigit, swapped, shortCode, belowCost, tooGood, fine] });
    validateReview([p], { minMarginPct: 20, maxMarginPct: 80 });
    expect(badDigit.flags.map((f) => f.code)).toEqual(["INVALID_BARCODE"]);
    expect(swapped.flags.map((f) => f.code)).toEqual(["SWAPPED_CODES"]);
    expect(shortCode.flags.map((f) => `${f.code}:${f.severity}`)).toEqual(["ODD_BARCODE:warning"]);
    expect(belowCost.flags.map((f) => `${f.code}:${f.severity}`)).toEqual(["NEGATIVE_PROFIT:error"]);
    expect(tooGood.flags.map((f) => `${f.code}:${f.severity}`)).toEqual(["HIGH_MARGIN:error"]);
    expect(fine.flags).toEqual([]);
    const hard = hardErrors([p]);
    expect(hard.length).toBe(4);
    expect(hard[0]).toContain("A-1");
    expect(hard.join(" ")).toContain("swapped");
  });

  it("still checks a duplicate SKU on a variant with no barcode when the shop requires one", () => {
    const a = emptyVariantView({ id: "v1", productId: "p1", sku: "SAME", option1Value: "1", costPrice: 300, retailPrice: 550, exGstRevenue: 500, landedCostAud: 300, profitPerUnit: 200, marginPct: 40 });
    const b = emptyVariantView({ id: "v2", productId: "p1", sku: "same", option1Value: "2", costPrice: 300, retailPrice: 550, exGstRevenue: 500, landedCostAud: 300, profitPerUnit: 200, marginPct: 40 });
    validateReview([product({ variants: [a, b] })], { minMarginPct: 20 });
    expect(a.flags.some((f) => f.code === "DUPLICATE_SKU_BATCH")).toBe(true);
    expect(b.flags.some((f) => f.code === "DUPLICATE_SKU_BATCH")).toBe(true);
  });

  it("stops the export while a product could be one of several the shop sells", () => {
    const v = emptyVariantView({ id: "v", productId: "p1", sku: "A-166", option1Value: "166", retailPrice: 550, costPrice: 300, exGstRevenue: 500, landedCostAud: 300, profitPerUnit: 200, marginPct: 40 });
    const p = product({ variants: [v], reconcileStatus: "AMBIGUOUS", matchCandidates: [{ id: "gid://1", handle: "bent-90-2026", title: "Bent 90 2026", on: ["barcode 874452900016"] }, { id: "gid://2", handle: "bent-90-2025", title: "Bent 90 2025", on: ["barcode 874452900016"] }] });
    validateReview([p], { minMarginPct: 20 });
    expect(p.flags.map((f) => `${f.code}:${f.severity}`)).toEqual(["FEW_IMAGES:warning", "AMBIGUOUS_MATCH:error"]);
    expect(hardErrors([p])[0]).toContain("bent-90-2026");
  });

  it("flags SKUs and handles that exist in the Shopify catalog", () => {
    const v = emptyVariantView({ id: "v", productId: "p1", sku: "A-166", option1Value: "166", retailPrice: 550, costPrice: 300, exGstRevenue: 500, landedCostAud: 300, profitPerUnit: 200, marginPct: 40 });
    const p = product({ variants: [v] });
    validateReview([p], { minMarginPct: 20, shopifySkus: new Map([["a-166", "atomic-bent-90"]]), shopifyHandles: new Set(["atomic-bent-90"]) });
    expect(v.flags.map((f) => f.code)).toEqual(["DUPLICATE_SKU_SHOPIFY"]);
    expect(p.flags.map((f) => f.code)).toEqual(["FEW_IMAGES", "UPDATE_EXISTING"]);
  });
});
