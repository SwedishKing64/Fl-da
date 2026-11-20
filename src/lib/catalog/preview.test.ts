import { describe, expect, it } from "vitest";
import { previewChange, type PreviewProduct } from "./preview";

const products: PreviewProduct[] = [
  { title: "Osprey Talon 22", vendor: "Osprey", productType: "Backpacks", category: "other", tags: ["Hiking"], skus: ["T22"] },
  { title: "Tempest 20", vendor: "Osprey", productType: "Backpacks", category: "other", tags: ["Hiking", "Sale"], skus: ["T20"] },
  { title: "Beta Jacket", vendor: "Arc'teryx", productType: "Jackets", category: "other", tags: [], skus: ["BJ"] },
];

describe("a change previewed on the latest batch", () => {
  it("shows a tag rule's reach, before and after", () => {
    const p = previewChange({ kind: "tag-rule", matchField: "brand", pattern: "Osprey", addTags: "Packs", setProductType: "" }, products);
    expect(p.touched).toBe(2);
    expect(p.samples[0]).toEqual({ title: "Osprey Talon 22", before: "tags Hiking", after: "tags Hiking, Packs" });
    expect(previewChange({ kind: "tag-rule", matchField: "brand", pattern: "Nobody", addTags: "X", setProductType: "" }, products).note).toBe("Touches none of the 3 products in the latest batch.");
  });
  it("shows titles with the brand taken off, and spellings and never-tags applied", () => {
    const brand = previewChange({ kind: "house", path: "naming.brandInTitle", value: "never" }, products);
    expect(brand.samples).toEqual([{ title: "Osprey Talon 22", before: "Osprey Talon 22", after: "Talon 22" }]);
    const voice = previewChange({ kind: "voice", spellings: [{ from: "Jacket", to: "Shell", brand: "Arc'teryx" }], neverTags: [{ tag: "Sale", brand: "" }] }, products);
    expect(voice.touched).toBe(2);
    expect(voice.samples).toEqual([{ title: "Tempest 20", before: "tags Hiking, Sale", after: "tags Hiking" }, { title: "Beta Jacket", before: "Beta Jacket", after: "Beta Shell" }]);
  });
  it("says what it cannot show", () => {
    expect(previewChange({ kind: "setting", key: "seoTone", value: "warm" }, products).samples).toEqual([]);
    expect(previewChange({ kind: "section", heading: "Our warranty", text: "Two years.", types: [], brands: ["Osprey"] }, products).touched).toBe(2);
  });
});
