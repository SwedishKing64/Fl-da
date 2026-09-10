import { describe, expect, it } from "vitest";
import { enrichFromSpecs } from "./pipeline";
import { emptyLineItem } from "./types";

describe("spec sheet enrichment", () => {
  it("merges description, specs, tags, images and RRP into the matching product", () => {
    const products = [
      { title: "Atomic Bent 90 Skis", brand: "Atomic", description: "", tags: ["skis"], imageUrls: [], metafields: {} as Record<string, string>, variants: [{ item: { ...emptyLineItem(), modelCode: "AA0029", sku: "AA0029-172" } }] },
      { title: "Atomic Hawx Ultra 100", brand: "Atomic", description: "", tags: [], imageUrls: [], metafields: {}, variants: [{ item: { ...emptyLineItem(), modelCode: "AE5031" } }] },
    ];
    const specs = [
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", title: "Bent 90", description: "Playful all-mountain freestyle ski.", flex: "Medium", terrain: "All-Mountain", tags: "Freestyle, Twin Tip", imageUrls: ["https://cdn.x.com/bent90.jpg"], rrp: 999 },
      { ...emptyLineItem(), brand: "Atomic", title: "Hawx Ultra 100", abilityLevel: "Advanced", width: "98mm" },
      { ...emptyLineItem(), brand: "Volkl", title: "Mantra", description: "should not match" },
    ];
    enrichFromSpecs(products, specs);
    expect(products[0].description).toBe("Playful all-mountain freestyle ski.");
    expect(products[0].tags).toEqual(["skis", "Freestyle", "Twin Tip"]);
    expect(products[0].imageUrls).toEqual(["https://cdn.x.com/bent90.jpg"]);
    expect(products[0].metafields).toMatchObject({ flex: "Medium", terrain: "All-Mountain" });
    expect(products[0].variants[0].item.rrp).toBe(999);
    expect(products[1].metafields).toMatchObject({ ability_level: "Advanced", waist_width: "98mm" });
    expect(products[1].description).toBe("");
  });
});
