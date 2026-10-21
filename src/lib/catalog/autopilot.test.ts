import { describe, expect, it } from "vitest";
import { canGoAlone, describeTier, readyToPush, tierFor } from "./autopilot-rules";
import { unscored } from "./confidence";
import { emptyVariantView } from "./validate";
import type { ReviewProduct } from "./review-types";
import type { SupplierRecord } from "./supplier-record";

function product(partial: Partial<ReviewProduct> = {}): ReviewProduct {
  return {
    id: "p1", handle: "atomic-bent-90", title: "Atomic Bent 90", bodyHtml: "<p>x</p>", vendor: "Atomic", productType: "Skis", category: "skis",
    tags: "skis", collections: "", status: "draft", published: false, seoTitle: "", seoDescription: "", lookupStatus: "NONE", lookupSource: "", matchCandidates: [], matchDecided: false, option1Name: "Length", option2Name: null, option3Name: null,
    metafields: {}, reconcileStatus: "NEW", shopifyProductId: null, images: [{ id: "i", url: "https://cdn.x.com/a.jpg", position: 1, variantId: null, source: "SUPPLIER", validated: true }],
    variants: [emptyVariantView({ id: "v1", productId: "p1", sku: "A-166", retailPrice: 899, landedCostAud: 450, quantity: 1 })], flags: [], confidence: unscored(), ...partial,
  };
}
const clean: SupplierRecord = { supplierId: "s", name: "Atomic", imports: 3, products: 60, touched: 3, share: 0.05 } as SupplierRecord;
const unknown: SupplierRecord = { supplierId: "s", name: "New", imports: 0, products: 0, touched: 0, share: null } as SupplierRecord;

describe("canGoAlone", () => {
  it("lets a product above the bar with nothing wrong go", () => {
    expect(canGoAlone(product())).toBe(true);
  });
  it("holds a product under the bar, one with an error, or one that could be several listings", () => {
    expect(canGoAlone(product({ confidence: { ...unscored(), product: 60, image: 60, weakest: "image" } }))).toBe(false);
    expect(canGoAlone(product({ flags: [{ code: "INVALID_BARCODE", severity: "error", message: "x" }] }))).toBe(false);
    expect(canGoAlone(product({ reconcileStatus: "AMBIGUOUS" }))).toBe(false);
  });
});

describe("readyToPush", () => {
  it("leaves out what is already in the store", () => {
    expect(readyToPush([product(), product({ id: "p2", shopifyProductId: "gid://1" })]).map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("tierFor", () => {
  const low = product({ id: "low", confidence: { ...unscored(), product: 40, tags: 40, weakest: "tags" } });
  it("is auto when every product can go and the supplier reads clean", () => {
    expect(tierFor([product(), product({ id: "p2" })], clean)).toBe("auto");
  });
  it("is exceptions when most can go", () => {
    expect(tierFor([product(), product({ id: "p2" }), low], clean)).toBe("exceptions");
  });
  it("is full for a supplier with no record, or a batch that is broadly unsure", () => {
    expect(tierFor([product(), product({ id: "p2" })], unknown)).toBe("full");
    expect(tierFor([product(), low, { ...low, id: "low2" }], clean)).toBe("full");
  });
  it("says what went and what waits", () => {
    expect(describeTier("exceptions", 5, 2)).toMatch(/5 products went .* 2 need a quick look/);
  });
});
