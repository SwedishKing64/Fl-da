import { describe, expect, it } from "vitest";
import { buildProductSetInput } from "./shopify";
import { emptyVariantView } from "./validate";
import type { ReviewProduct } from "./review-types";

describe("productSet input", () => {
  it("maps a reviewed product into the Admin API shape", () => {
    const p: ReviewProduct = {
      id: "p", handle: "atomic-bent-90", title: "Atomic Bent 90", bodyHtml: "<p>x</p>", vendor: "Atomic", productType: "Skis", category: "skis",
      tags: "skis, Atomic", collections: "Skis", status: "draft", published: false, seoTitle: "t", seoDescription: "d", lookupStatus: "NONE", lookupSource: "",
      option1Name: "Length", option2Name: "Colour", option3Name: null, metafields: { flex: "Medium", length_cm: "166, 172" },
      reconcileStatus: "NEW", shopifyProductId: null,
      images: [{ id: "i", url: "https://cdn.x.com/a.jpg", position: 1, variantId: null, source: "SUPPLIER", validated: true }],
      variants: [
        emptyVariantView({ id: "v1", productId: "p", sku: "A-166", option1Value: "166", option2Value: "Blue", retailPrice: 899.99, compareAtPrice: 999, landedCostAud: 450, quantity: 2, grams: 3200 }),
        emptyVariantView({ id: "v2", productId: "p", sku: "A-172", option1Value: "172", option2Value: "Blue", retailPrice: 899.99, compareAtPrice: 800, landedCostAud: 450, quantity: 1 }),
      ],
      flags: [],
    };
    const input = buildProductSetInput(p, { publish: false, locationId: "gid://shopify/Location/1" });
    expect(input.id).toBeUndefined();
    expect(input.status).toBe("DRAFT");
    expect(input.productOptions).toEqual([
      { name: "Length", values: [{ name: "166" }, { name: "172" }] },
      { name: "Colour", values: [{ name: "Blue" }] },
    ]);
    expect(input.variants[0]).toMatchObject({
      sku: "A-166", price: "899.99", compareAtPrice: "999.00",
      optionValues: [{ optionName: "Length", name: "166" }, { optionName: "Colour", name: "Blue" }],
      inventoryItem: { cost: "450.00", tracked: true, measurement: { weight: { unit: "GRAMS", value: 3200 } } },
      inventoryQuantities: [{ locationId: "gid://shopify/Location/1", name: "available", quantity: 2 }],
    });
    expect(input.variants[1].compareAtPrice).toBeNull();
    expect(input.files).toEqual([{ originalSource: "https://cdn.x.com/a.jpg", contentType: "IMAGE", alt: "Atomic Bent 90" }]);
    expect(input.metafields).toEqual([
      { namespace: "ski", key: "length_cm", type: "single_line_text_field", value: "166, 172" },
      { namespace: "ski", key: "flex", type: "single_line_text_field", value: "Medium" },
    ]);
    const perLocation = buildProductSetInput(p, { publish: true, locationId: "L1", locationQuantities: { v1: { L1: 1, L2: 1 } } });
    expect(perLocation.status).toBe("ACTIVE");
    expect(perLocation.variants[0].inventoryQuantities).toHaveLength(2);
  });
});
