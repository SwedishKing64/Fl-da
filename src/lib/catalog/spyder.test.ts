import { describe, expect, it } from "vitest";
import { groupLineItems, type GroupedProduct } from "./grouping";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import type { CanonicalLineItem } from "./types";

/**
 * A real Boardriders/Spyder invoice, as the line items an extractor should produce from it.
 *
 * The document is a photographed size grid: sizes run across as column headers and the quantities
 * are handwritten in the cells, under section headings that read "SPYD - Mens - Technical Jackets".
 * Reading it produced a batch where every product came out tagged as socks with no year and no
 * house tag, so this pins what the same products must produce now.
 *
 * Prices and colours are the invoice's own. RRP is the price; "price net" is what was paid.
 */
const line = (over: Partial<CanonicalLineItem>): CanonicalLineItem => ({
  title: "", brand: "Spyder", modelCode: "", sku: "", barcode: "", costPrice: null, quantity: null, rrp: null,
  length: "", size: "", width: "", colour: "", gender: "", season: "2026", category: "apparel",
  description: "", specs: "", abilityLevel: "", terrain: "", flex: "", imageUrls: [],
  // The supplier's own section heading, which is what reached the CSV as a tag.
  tags: "Technical Jackets",
  ...over,
} as CanonicalLineItem);

const INVOICE: CanonicalLineItem[] = [
  line({ title: "Pinnacle Jacket", modelCode: "38SA073500-SLB", colour: "Slate Blue", size: "M", quantity: 1, costPrice: 442.88, rrp: 1499, gender: "Mens" }),
  line({ title: "Pinnacle Jacket", modelCode: "38SA073500-SLB", colour: "Slate Blue", size: "L", quantity: 1, costPrice: 442.88, rrp: 1499, gender: "Mens" }),
  line({ title: "Leader Jacket", modelCode: "38SA073514-BLK", colour: "Black", size: "L", quantity: 1, costPrice: 221.29, rrp: 749, gender: "Mens" }),
  line({ title: "Leader Jacket", modelCode: "38SA073514-BLK", colour: "Black", size: "XL", quantity: 1, costPrice: 221.29, rrp: 749, gender: "Mens" }),
  line({ title: "Leader Jacket", modelCode: "38SA073514-SMM", colour: "Storm Melange", size: "M", quantity: 1, costPrice: 221.29, rrp: 749, gender: "Mens" }),
  line({ title: "Leader Jacket", modelCode: "38SA073514-SMM", colour: "Storm Melange", size: "XXL", quantity: 1, costPrice: 221.29, rrp: 749, gender: "Mens" }),
  line({ title: "Bormio Pants", modelCode: "38SA123500-BLK", colour: "Black", size: "L", quantity: 1, costPrice: 206.52, rrp: 699, gender: "Mens", tags: "Technical Pants" }),
  line({ title: "Primrose Jacket", modelCode: "38SD073504-BLK", colour: "Black", size: "8", quantity: 1, costPrice: 236.07, rrp: 799, gender: "Womens" }),
  line({ title: "Primrose Jacket", modelCode: "38SD073504-BLK", colour: "Black", size: "10", quantity: 1, costPrice: 236.07, rrp: 799, gender: "Womens" }),
  line({ title: "Primrose Jacket", modelCode: "38SD073504-BLK", colour: "Black", size: "12", quantity: 1, costPrice: 236.07, rrp: 799, gender: "Womens" }),
  line({ title: "Orb Pant", modelCode: "38SD475306-BLK2", colour: "Black", size: "10", quantity: 2, costPrice: 97.21, rrp: 329, gender: "Womens", tags: "Technical Pants" }),
  line({ title: "Orb Pant", modelCode: "38SD475306-BLK2", colour: "Black", size: "12", quantity: 1, costPrice: 97.21, rrp: 329, gender: "Womens", tags: "Technical Pants" }),
];

const built = groupLineItems(INVOICE, DEFAULT_CATEGORY_RULES);
// The shop writes the audience on the front of a garment's name — "Men's Pinnacle Jacket" — so a
// product is found by the name the invoice gave it, whichever audience went on the front.
const find = (title: string): GroupedProduct => built.find((p) => p.title.replace(/^(Men's|Women's|Kids') /, "").startsWith(title))!;

describe("a Spyder apparel invoice", () => {
  it("types a jacket as Snow Jackets and a pant as Snow Pants, never socks", () => {
    // Every line states category "apparel". Six clothing rules share that category, and taking
    // whichever sorted first turned all of them into Snow Socks.
    expect(find("Pinnacle Jacket").productType).toBe("Snow Jackets");
    expect(find("Bormio Pants").productType).toBe("Snow Pants");
    expect(find("Orb Pant").productType).toBe("Snow Pants");
    for (const p of built) expect(p.productType).not.toBe("Snow Socks");
  });

  it("carries the shop's own tags, including the year and the house tag", () => {
    const tags = find("Pinnacle Jacket").tags;
    expect(tags).toContain("snow jackets");
    expect(tags).toContain("snow-clothing");
    expect(tags).toContain("2026");
    // The marker with nobody named: this fixture groups line items directly, without a batch to
    // say who built them. In the app the batch carries the initials — see "Built by".
    expect(tags).toContain("123abc");
    expect(tags).toContain("spyder");
    expect(tags).toContain("mens");
  });

  it("never writes a pant as anything but snow pants", () => {
    expect(find("Bormio Pants").tags).toContain("snow pants");
    expect(find("Bormio Pants").tags).not.toContain("pants");
  });

  it("drops the supplier's section heading instead of publishing it as a tag", () => {
    for (const p of built) {
      for (const tag of p.tags) {
        expect(tag.toLowerCase()).not.toContain("technical");
      }
    }
  });

  it("reads the gender off the invoice, on both sides of it", () => {
    expect(find("Pinnacle Jacket").tags).toContain("mens");
    expect(find("Primrose Jacket").tags).toContain("womens");
    expect(find("Primrose Jacket").tags).not.toContain("mens");
  });

  it("keeps the sizes, and puts colour before size as the catalogue does", () => {
    const leader = find("Leader Jacket");
    expect([leader.option1Name, leader.option2Name]).toEqual(["Colour", "Size"]);
    // Two colourways of the same jacket are one product with four variants between them.
    expect(leader.variants.map((v) => `${v.option1Value}/${v.option2Value}`).sort()).toEqual([
      "Black/L", "Black/XL", "Storm Melange/M", "Storm Melange/XXL",
    ]);
  });

  it("takes the recommended retail as the price and the net as the cost", () => {
    const pinnacle = find("Pinnacle Jacket");
    expect(pinnacle.variants[0].item.rrp).toBe(1499);
    expect(pinnacle.variants[0].item.costPrice).toBe(442.88);
  });
});
