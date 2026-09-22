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
    // In the shop's own shape now: 733 of their 845 bodies carry a Tech Specs list, and a
    // description written raw matched none of them.
    expect(products[0].description).toBe(
      ["<p>Playful all-mountain freestyle ski.</p>", "<h2>Tech Specs</h2>", "<ul>", "<li>FLEX: Medium</li>", "<li>TERRAIN: All-Mountain</li>", "</ul>"].join("\n"),
    );
    expect(products[0].tags).toEqual(["skis", "Freestyle", "Twin Tip"]);
    expect(products[0].imageUrls).toEqual(["https://cdn.x.com/bent90.jpg"]);
    expect(products[0].metafields).toMatchObject({ flex: "Medium", terrain: "All-Mountain" });
    expect(products[0].variants[0].item.rrp).toBe(999);
    expect(products[1].metafields).toMatchObject({ ability_level: "Advanced", waist_width: "98mm" });
    // A spec row with no prose on it still writes its Tech Specs, because a supplier's export is
    // all numbers and no words and those numbers are most of what a customer wants. The body
    // still reads as unwritten, so the web lookup can add the prose later.
    expect(products[1].description).toBe(
      ["<h2>Tech Specs</h2>", "<ul>", "<li>WAIST WIDTH: 98mm</li>", "<li>ABILITY: Advanced</li>", "</ul>"].join("\n"),
    );
  });
});
