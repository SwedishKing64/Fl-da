import { describe, expect, it } from "vitest";
import { resolveAgainstReference } from "./reference-match";
import { enrichFromSpecs } from "./specs";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import type { CanonicalLineItem } from "./types";

const item = (over: Partial<CanonicalLineItem>): CanonicalLineItem => ({
  title: "", brand: "Burton", modelCode: "", sku: "", barcode: "", costPrice: null, quantity: null, rrp: null, grams: null,
  length: "", size: "", width: "", colour: "", gender: "", season: "", category: "", productType: "", description: "",
  flex: "", abilityLevel: "", dinRange: "", terrain: "", imageUrls: [], collections: "", tags: "", ...over,
});

/** Burton's order form as the reference reader gives it: a SKU and an EAN per size, a terse name, no model code, no description. */
const orderForm = [
  item({ title: "FREESTYLE", sku: "105441CA02RG00M", barcode: "9010884447175", colour: "Black", size: "M", gender: "MENS", category: "BINDINGS", productType: "BINDINGS STRAP", costPrice: 167.99 }),
  item({ title: "FREESTYLE", sku: "105441CA02RG00L", barcode: "9010884447168", colour: "Black", size: "L", gender: "MENS", category: "BINDINGS", productType: "BINDINGS STRAP", costPrice: 167.99 }),
  item({ title: "AK CYCLIC GTX 2L JK", sku: "1000212A04RG00S", barcode: "9010884335908", colour: "Chinchilla Gray", size: "S", gender: "MENS", category: "OUTERWEAR", costPrice: 381.81 }),
];
/** Burton's description list: a model code, the catalogue name and the words. */
const descriptions = [
  item({ modelCode: "10544", title: "Men's Freestyle Re:Flex Snowboard Bindings", description: "Easy-going and forgiving, the Freestyle binding is built for progression.", season: "27WIN" }),
  item({ modelCode: "10002", title: "Men's [ak] Cyclic GORE-TEX 2L Jacket", description: "Storm-ready GORE-TEX in a clean cut.", season: "27WIN" }),
];

describe("joining an invoice to Burton's order form", () => {
  it("finds the row by its barcode, keeps the invoice's own name over the form's terse one, and takes the SKU", () => {
    const lines = [item({ title: "Men's Freestyle Snowboard Bindings", barcode: "9010884447175", size: "M", gender: "MENS" })];
    const r = resolveAgainstReference(lines, orderForm, DEFAULT_CATEGORY_RULES);
    expect(r.joined[0]).toEqual({ line: "Men's Freestyle Snowboard Bindings", to: "FREESTYLE", how: "barcode" });
    expect(r.items[0].title).toBe("Men's Freestyle Snowboard Bindings");
    expect(r.items[0].sku).toBe("105441CA02RG00M");
    expect(r.items[0].barcode).toBe("9010884447175");
    expect(r.items[0].colour).toBe("Black");
  });

  it("finds the row by Burton's style number when the invoice has no barcode, the SKU extending the style", () => {
    const lines = [item({ title: "Men's Freestyle Snowboard Bindings", sku: "105441", size: "L", gender: "MENS" })];
    const r = resolveAgainstReference(lines, orderForm, DEFAULT_CATEGORY_RULES);
    expect(r.joined[0]).toMatchObject({ to: "FREESTYLE", how: "code" });
    expect(r.items[0].title).toBe("Men's Freestyle Snowboard Bindings");
  });

  it("takes the description from the description list loaded alongside, found by name", () => {
    const lines = [
      item({ title: "Men's Freestyle Snowboard Bindings", barcode: "9010884447175", size: "M", gender: "MENS" }),
      item({ title: "Men's [ak] Cyclic GORE-TEX Jacket", barcode: "9010884335908", size: "S", gender: "MENS" }),
    ];
    const r = resolveAgainstReference(lines, [...orderForm, ...descriptions], DEFAULT_CATEGORY_RULES);
    expect(r.joined.map((j) => ("how" in j ? j.how : j.reason))).toEqual(["barcode", "barcode"]);
    // The model is known by the list's code now, which is how the words are found when the product is built.
    expect(r.items.map((i) => i.modelCode)).toEqual(["10544", "10002"]);
    expect(r.items[0].sku).toBe("105441CA02RG00M");
    const built = enrichFromSpecs(r.items.map((i) => ({ title: i.title, brand: "Burton", description: "", tags: [] as string[], imageUrls: [] as string[], metafields: {} as Record<string, string>, variants: [{ item: i }] })), [...orderForm, ...descriptions]);
    expect(built[0].description).toContain("Freestyle binding");
    expect(built[1].description).toContain("Storm-ready");
    // The invoice's own name stays: the list was only asked for the words.
    expect(r.items[1].title).toBe("Men's [ak] Cyclic GORE-TEX Jacket");
  });

  it("still names the product from a catalogue row, which does know the model's name", () => {
    const lines = [item({ title: "CUSTOM NEW GRAPHIC", modelCode: "10688", size: "158W" })];
    const catalogue = [item({ modelCode: "10688", title: "Men's Custom Camber Snowboard", description: "A legend." })];
    const r = resolveAgainstReference(lines, catalogue, DEFAULT_CATEGORY_RULES);
    expect(r.joined[0]).toMatchObject({ how: "code" });
    expect(r.items[0].title).toBe("Custom");
  });

  it("does not take a barcode that is only nearly the same", () => {
    const lines = [item({ title: "Something Else", barcode: "9010884447100", sku: "" })];
    const r = resolveAgainstReference(lines, orderForm, DEFAULT_CATEGORY_RULES);
    expect("reason" in r.joined[0]).toBe(true);
  });
});
