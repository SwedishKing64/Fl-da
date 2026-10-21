import { afterEach, describe, expect, it } from "vitest";
import { ALPSPORT_CONVENTIONS, activateConventions, isValidType, productTypes, typesAreKnown } from "./taxonomy";
import { emptyVariantView, hardErrors, validateReview } from "./validate";
import type { ReviewProduct } from "./review-types";
import { unscored } from "./confidence";

function product(partial: Partial<ReviewProduct>): ReviewProduct {
  return {
    id: "p1", handle: "merino-crew", title: "Merino Crew", bodyHtml: "", vendor: "Northwind", productType: "Knitwear", category: "clothing",
    tags: "", collections: "", status: "draft", published: false, seoTitle: "", seoDescription: "", lookupStatus: "NONE", lookupSource: "", matchCandidates: [], matchDecided: false, option1Name: "Size", option2Name: null, option3Name: null,
    metafields: {}, reconcileStatus: "UNKNOWN", shopifyProductId: null, images: [{ id: "i", url: "https://cdn.x.com/a.jpg", position: 1, variantId: null, source: "SUPPLIER", validated: true }],
    variants: [emptyVariantView({ id: "v1", productId: "p1", sku: "NW-1", option1Value: "M", costPrice: 58, retailPrice: 139, exGstRevenue: 126.36, gstComponent: 12.64, landedCostAud: 58, profitPerUnit: 68.36, marginPct: 54, quantity: 2 })],
    flags: [], confidence: unscored(), ...partial,
  };
}

const website = { url: "https://shop.example", source: "shopify" as const, readAt: "2026-10-15T00:00:00Z", categories: [{ title: "Skis", path: "/collections/skis" }, { title: "Jackets", path: "/collections/jackets" }, { title: "Gloves & Mitts", path: "/collections/gloves-mitts" }] };

describe("the website's categories as kinds of product", () => {
  afterEach(() => activateConventions(ALPSPORT_CONVENTIONS));

  it("are the whole vocabulary on a blank shop, and nothing is known before they are read", () => {
    activateConventions({ pack: "general", learned: null, marker: "" });
    expect(typesAreKnown()).toBe(false);
    activateConventions({ pack: "general", learned: null, marker: "", website });
    expect(typesAreKnown()).toBe(true);
    expect(productTypes()).toEqual(["Skis", "Jackets", "Gloves & Mitts"]);
    expect(isValidType("jackets")).toBe(true);
    expect(isValidType("Gloves and Mitts")).toBe(true);
    expect(isValidType("Knitwear")).toBe(false);
  });

  it("join the export's kinds without doubling one both name", () => {
    activateConventions({ pack: "general", marker: "", website, learned: { types: [{ type: "Skis", count: 40, sections: ["Ski"] }, { type: "Ski Poles", count: 3, sections: [] }], sections: ["Ski"], spelling: {}, vendors: [], products: 43, file: "export.csv", learnedAt: "2026-10-15T00:00:00Z" } });
    expect(productTypes()).toEqual(["Skis", "Ski Poles", "Jackets", "Gloves & Mitts"]);
  });

  it("stop the export on a Type the site does not have, and let a blank shop be", () => {
    activateConventions({ pack: "general", learned: null, marker: "", website });
    const wrong = product({});
    const right = product({ id: "p2", handle: "shell", productType: "jackets", variants: [emptyVariantView({ id: "v2", productId: "p2", sku: "NW-2", option1Value: "M", costPrice: 96, retailPrice: 229, exGstRevenue: 208.18, gstComponent: 20.82, landedCostAud: 96, profitPerUnit: 112.18, marginPct: 54, quantity: 1 })] });
    validateReview([wrong, right], { minMarginPct: 20 });
    const typeFlags = (p: ReviewProduct) => p.flags.filter((f) => f.code.endsWith("_TYPE")).map((f) => `${f.code}:${f.severity}`);
    expect(typeFlags(wrong)).toEqual(["UNKNOWN_TYPE:error"]);
    expect(typeFlags(right)).toEqual([]);
    expect(hardErrors([wrong, right])).toHaveLength(1);
    expect(hardErrors([wrong])[0]).toContain("Knitwear");

    activateConventions({ pack: "general", learned: null, marker: "" });
    const unchecked = product({});
    validateReview([unchecked], { minMarginPct: 20 });
    expect(typeFlags(unchecked)).toEqual([]);
  });
});
