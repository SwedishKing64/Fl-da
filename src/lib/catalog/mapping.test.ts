import { describe, expect, it } from "vitest";
import { applyMapping, headerHash, mappingProblems, suggestMapping } from "./mapping";
import { DEFAULT_CATEGORY_RULES, chooseOptions, detectCategory, enrichFromTitle } from "./categorize";
import { groupLineItems } from "./grouping";
import { emptyLineItem } from "./types";

describe("mapping suggestions", () => {
  it("maps common supplier headers to canonical fields", () => {
    const m = suggestMapping(["Style No", "Item Description", "Colour", "Length (cm)", "EAN", "Qty", "WHS Price", "RRP", "Image URL", "Notes"]);
    expect(m["Style No"]).toBe("modelCode");
    expect(m["Item Description"]).toBe("title");
    expect(m["Colour"]).toBe("colour");
    expect(m["Length (cm)"]).toBe("length");
    expect(m["EAN"]).toBe("barcode");
    expect(m["Qty"]).toBe("quantity");
    expect(m["WHS Price"]).toBe("costPrice");
    expect(m["RRP"]).toBe("rrp");
    expect(m["Image URL"]).toBe("imageUrls");
    expect(m["Notes"]).toBe("");
  });

  it("does not assign the same canonical field twice", () => {
    const m = suggestMapping(["Price", "Unit Price"]);
    expect(Object.values(m).filter((v) => v === "costPrice")).toHaveLength(1);
  });

  it("hashes headers independent of case and punctuation", () => {
    expect(headerHash(["SKU", "Unit-Price"])).toBe(headerHash(["sku", "unit price"]));
    expect(headerHash(["SKU"])).not.toBe(headerHash(["Barcode"]));
  });

  it("applies a mapping with number parsing, fixed values and line-total costs", () => {
    const item = applyMapping(
      { Code: "AA0029-172", Name: "Bent 90 172", Cost: "$1,350.00", Qty: "3", Images: "https://a.com/1.jpg | https://a.com/2.jpg", Brand: "" },
      { Code: "sku", Name: "title", Cost: "costPrice", Qty: "quantity", Images: "imageUrls", Brand: "brand" },
      { fixed: { brand: "Atomic", season: "2026" }, costIsLineTotal: true },
    );
    expect(item.sku).toBe("AA0029-172");
    expect(item.costPrice).toBe(450);
    expect(item.quantity).toBe(3);
    expect(item.brand).toBe("Atomic");
    expect(item.season).toBe("2026");
    expect(item.imageUrls).toEqual(["https://a.com/1.jpg", "https://a.com/2.jpg"]);
    expect(mappingProblems({ Code: "sku" })).toHaveLength(2);
  });
});

describe("categorisation", () => {
  it("detects categories with boots winning over skis", () => {
    const boot = { ...emptyLineItem(), title: "Hawx Ultra 100 Ski Boot" };
    const ski = { ...emptyLineItem(), title: "Bent 90", productType: "Skis" };
    const stated = { ...emptyLineItem(), title: "Thing", category: "goggles" };
    expect(detectCategory(boot, DEFAULT_CATEGORY_RULES)?.category).toBe("boots");
    expect(detectCategory(ski, DEFAULT_CATEGORY_RULES)?.category).toBe("skis");
    expect(detectCategory(stated, DEFAULT_CATEGORY_RULES)?.category).toBe("goggles");
    expect(detectCategory({ ...emptyLineItem(), title: "Mystery" }, DEFAULT_CATEGORY_RULES)).toBeNull();
  });

  it("pulls length / size / season / colour out of titles", () => {
    const ski = enrichFromTitle({ ...emptyLineItem(), title: "Bent 90 2026 172cm", colour: "Blue" }, "skis");
    expect(ski).toMatchObject({ title: "Bent 90 2026", length: "172", season: "2026" });
    const boot = enrichFromTitle({ ...emptyLineItem(), title: "Hawx Ultra 100 26.5" }, "boots");
    expect(boot).toMatchObject({ title: "Hawx Ultra 100", size: "26.5" });
    const coloured = enrichFromTitle({ ...emptyLineItem(), title: "Beanie - Black", colour: "Black" }, "accessories");
    expect(coloured.title).toBe("Beanie");
  });

  it("chooses options from attributes that are actually present", () => {
    const rule = DEFAULT_CATEGORY_RULES.find((r) => r.category === "boots")!;
    const items = [
      { ...emptyLineItem(), size: "26.5", colour: "Black" },
      { ...emptyLineItem(), size: "27.5", colour: "Black" },
    ];
    expect(chooseOptions(rule, items)).toEqual(["size", "colour"]);
    expect(chooseOptions(null, [{ ...emptyLineItem(), length: "170" }, { ...emptyLineItem(), length: "177" }])).toEqual(["length"]);
  });
});

describe("grouping", () => {
  it("groups by brand + model code into products with option values", () => {
    const items = [
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", sku: "AA0029-166", title: "Bent 90 Skis", length: "166", colour: "Blue", costPrice: 450, quantity: 1 },
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", sku: "AA0029-172", title: "Bent 90 Skis", length: "172", colour: "Blue", costPrice: 450, quantity: 2 },
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", sku: "AA0029-172", title: "Bent 90 Skis", length: "172", colour: "Blue", costPrice: 450, quantity: 1 },
      { ...emptyLineItem(), brand: "Acme", sku: "BEANIE-BLK", title: "Beanie Black", colour: "Black", costPrice: 10, quantity: 5 },
    ];
    const products = groupLineItems(items, DEFAULT_CATEGORY_RULES);
    expect(products).toHaveLength(2);
    const skis = products[0];
    // The Title column carries the product's name, not its brand: that is the Vendor column's job.
    expect(skis.title).toBe("Bent 90 Skis");
    expect(skis.brand).toBe("Atomic");
    expect(skis.handle).toBe("atomic-bent-90-skis");
    expect(skis.category).toBe("skis");
    expect(skis.productType).toBe("Skis");
    expect(skis.option1Name).toBe("Length");
    expect(skis.option2Name).toBe("Colour"); // preferred attribute present on the rows
    expect(skis.variants).toHaveLength(2);
    expect(skis.variants[1].item.quantity).toBe(3); // duplicate sku line merged
    expect(skis.metafields.length_cm).toBe("166, 172");
    expect(skis.tags).toContain("atomic"); // the catalogue writes a vendor in lower case
    expect(products[1].title).toBe("Beanie");
  });
});
