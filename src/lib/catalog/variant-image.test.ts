import { describe, expect, it } from "vitest";
import { toCsvProducts } from "./pipeline-pure";
import type { ReviewProduct, ReviewVariant } from "./review-types";

const variant = (id: string, colour: string, size: string): ReviewVariant => ({
  id, sku: id, barcode: "", option1Value: colour, option2Value: size, option3Value: null, grams: 0, quantity: 1,
  costPrice: 100, gstTreatment: "EXCLUSIVE", freightPerUnitHome: 0, landedCostHome: 100, retailPrice: 200, retailOverride: null,
  compareAtPrice: null, pricingRuleId: null, pricingRuleName: null, marginPct: 50, profitPerUnit: 100, reconcileStatus: "NEW",
  shopifyVariantId: null, locationQuantities: {}, warningsDismissed: [], flags: [],
} as unknown as ReviewVariant);

const product = (images: ReviewProduct["images"], variants: ReviewVariant[]): ReviewProduct => ({
  id: "p1", handle: "freestyle", title: "Freestyle", bodyHtml: "", vendor: "Burton", productType: "Snowboard Bindings", category: "", tags: "", collections: "",
  status: "draft", published: false, seoTitle: "", seoDescription: "", lookupStatus: "NONE", lookupSource: "", matchCandidates: [], matchDecided: false,
  option1Name: "Colour", option2Name: "Size", option3Name: null, metafields: {}, reconcileStatus: "NEW", shopifyProductId: null,
  images, variants, flags: [],
});

describe("a colour's picture on every variant of that colour", () => {
  it("gives the other sizes of a colour the picture put on one of them", () => {
    const variants = [variant("blk-s", "Black", "S"), variant("blk-m", "Black", "M"), variant("red-s", "Red", "S"), variant("red-m", "Red", "M")];
    const images = [
      { id: "i1", url: "https://x/black.jpg", position: 1, variantId: "blk-s", source: "PAGE", validated: false },
      { id: "i2", url: "https://x/red.jpg", position: 2, variantId: "red-m", source: "PAGE", validated: false },
      { id: "i3", url: "https://x/detail.jpg", position: 3, variantId: null, source: "PAGE", validated: false },
    ];
    const [csv] = toCsvProducts([product(images, variants)]);
    expect(csv.variants.map((v) => v.imageUrl)).toEqual(["https://x/black.jpg", "https://x/black.jpg", "https://x/red.jpg", "https://x/red.jpg"]);
    expect(csv.images.map((i) => i.url)).toEqual(["https://x/black.jpg", "https://x/red.jpg", "https://x/detail.jpg"]);
  });
  it("leaves a variant without a picture when no picture of its colour was put on any variant", () => {
    const variants = [variant("blk-s", "Black", "S"), variant("blu-s", "Blue", "S")];
    const images = [{ id: "i1", url: "https://x/black.jpg", position: 1, variantId: "blk-s", source: "PAGE", validated: false }];
    const [csv] = toCsvProducts([product(images, variants)]);
    expect(csv.variants.map((v) => v.imageUrl)).toEqual(["https://x/black.jpg", null]);
  });
  it("changes nothing for a product with no colour option", () => {
    const v = { ...variant("one", "", "S"), option1Value: "S", option2Value: null };
    const p = { ...product([{ id: "i1", url: "https://x/a.jpg", position: 1, variantId: null, source: "SUPPLIER", validated: true }], [v]), option1Name: "Size", option2Name: null };
    const [csv] = toCsvProducts([p]);
    expect(csv.variants[0].imageUrl).toBeNull();
  });
});
