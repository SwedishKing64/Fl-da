import { describe, expect, it } from "vitest";
import { blockingErrors, emptyVariantView, summarise, validateReview } from "./validate";
import type { ReviewProduct } from "./review-types";

function product(partial: Partial<ReviewProduct>): ReviewProduct {
  return {
    id: "p1", handle: "atomic-bent-90", title: "Atomic Bent 90", bodyHtml: "", vendor: "Atomic", productType: "Skis", category: "skis",
    tags: "", collections: "", status: "draft", published: false, seoTitle: "", seoDescription: "", option1Name: "Length", option2Name: null, option3Name: null,
    metafields: {}, reconcileStatus: "UNKNOWN", shopifyProductId: null, images: [{ id: "i", url: "https://cdn.x.com/a.jpg", position: 1, variantId: null, source: "SUPPLIER", validated: true }],
    variants: [], flags: [], ...partial,
  };
}

describe("review validation", () => {
  it("raises errors for missing price, duplicate skus/handles/options and warnings for images/margin", () => {
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
    expect(errors.length).toBe(9);
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

  it("flags SKUs and handles that exist in the Shopify catalog", () => {
    const v = emptyVariantView({ id: "v", productId: "p1", sku: "A-166", option1Value: "166", retailPrice: 550, costPrice: 300, exGstRevenue: 500, landedCostAud: 300, profitPerUnit: 200, marginPct: 40 });
    const p = product({ variants: [v] });
    validateReview([p], { minMarginPct: 20, shopifySkus: new Map([["a-166", "atomic-bent-90"]]), shopifyHandles: new Set(["atomic-bent-90"]) });
    expect(v.flags.map((f) => f.code)).toEqual(["DUPLICATE_SKU_SHOPIFY"]);
    expect(p.flags.map((f) => f.code)).toEqual(["FEW_IMAGES", "UPDATE_EXISTING"]);
  });
});
