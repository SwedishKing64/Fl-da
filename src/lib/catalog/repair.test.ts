import { describe, expect, it } from "vitest";
import { repairForExport } from "./repair";
import { validateProducts, type CsvProduct } from "./csv";

/**
 * Built from the Boardriders invoice the shop actually sent (invoice STI0000128916, 25/08/2026).
 *
 * It is a size grid: the Item column codes a colourway — 38SA073514-BLK is the black Leader Jacket
 * — and the sizes ordered are circled by hand across the S/M/L/XL/XXL/XXXL columns. So one code
 * arrives on every size. Under the old rules that was "SKU appears more than once in this batch",
 * an error, on every variant of every product, and the export refused outright.
 */
function leaderJacket(sizes: string[]): CsvProduct {
  return {
    handle: "spyder-leader-jacket-2026",
    title: "Spyder Leader Jacket 2026",
    vendor: "Spyder",
    productType: "Snow Clothing",
    option1Name: "Colour",
    option2Name: "Size",
    images: [],
    variants: sizes.map((size) => ({ sku: "38SA073514-BLK", option1Value: "Black", option2Value: size, quantity: 1, price: 749 })),
  };
}

describe("repairing a batch instead of refusing it", () => {
  it("gives each size of a colourway its own SKU", () => {
    const { products, repairs } = repairForExport([leaderJacket(["M", "L", "XL"])]);
    expect(products[0].variants.map((v) => v.sku)).toEqual(["38SA073514-BLK", "38SA073514-BLK-black-l", "38SA073514-BLK-black-xl"]);
    expect(repairs).toHaveLength(2);
    expect(repairs[0].what).toContain("38SA073514-BLK");
    // And the result is something Shopify accepts.
    expect(validateProducts(products).filter((i) => i.level === "error")).toEqual([]);
  });

  it("merges two rows that describe the same variant, adding the quantities", () => {
    const p = leaderJacket(["L", "L"]);
    const { products, repairs } = repairForExport([p]);
    expect(products[0].variants).toHaveLength(1);
    expect(products[0].variants[0].quantity).toBe(2);
    expect(repairs.some((r) => r.what.includes("merged"))).toBe(true);
  });

  it("drops an option column nothing filled, and fills the gaps in one that some did", () => {
    const missing: CsvProduct = { ...leaderJacket(["L", "XL"]), option3Name: "Length" };
    missing.variants[1].option2Value = "";
    const { products, repairs } = repairForExport([missing]);
    expect(products[0].option3Name).toBeNull();
    expect(products[0].variants[1].option2Value).toBe("One Size");
    expect(repairs.some((r) => r.what.includes("Length"))).toBe(true);
    expect(validateProducts(products).filter((i) => i.level === "error")).toEqual([]);
  });

  it("settles a handle used twice and one that is unusable", () => {
    const a = leaderJacket(["L"]);
    const b = { ...leaderJacket(["XL"]), title: "Spyder Leader Jacket 2026" };
    const c = { ...leaderJacket(["XXL"]), handle: "Not A Handle!", title: "Spyder Pinnacle Jacket 2026" };
    const { products } = repairForExport([a, b, c]);
    expect(new Set(products.map((p) => p.handle)).size).toBe(3);
    expect(products[2].handle).toBe("spyder-pinnacle-jacket-2026");
    expect(validateProducts(products).filter((i) => i.level === "error")).toEqual([]);
  });

  it("names a product that arrived without a title", () => {
    const p = { ...leaderJacket(["L"]), title: "" };
    const { products, repairs } = repairForExport([p]);
    expect(products[0].title).toBe("38SA073514-BLK");
    expect(repairs[0].what).toContain("had no title");
  });

  it("gives an optionless product Shopify's own default", () => {
    const p: CsvProduct = { handle: "beanie", title: "Beanie", images: [], option1Name: null, variants: [{ sku: "B1", price: 39.95 }] };
    const { products } = repairForExport([p]);
    expect(products[0].option1Name).toBe("Title");
    expect(products[0].variants[0].option1Value).toBe("Default Title");
    expect(validateProducts(products).filter((i) => i.level === "error")).toEqual([]);
  });

  it("repairs the whole invoice without leaving a single blocking error", () => {
    // All nine lines, each a colourway ordered in several sizes, as the real document has them.
    const lines: Array<[string, string, string, number, string[]]> = [
      ["38SA073500-SLB", "Spyder Pinnacle Jacket 2026", "Slate Blue", 1499, ["M", "L"]],
      ["38SA073514-BLK", "Spyder Leader Jacket 2026", "Black", 749, ["L", "XL"]],
      ["38SA073514-SMM", "Spyder Leader Jacket 2026", "Storm Melange", 749, ["M", "XXL"]],
      ["38SA123500-BLK", "Spyder Bormio Pants 2026", "Black", 699, ["L"]],
      ["38SD073504-BLK", "Spyder Primrose Jacket 2026", "Black", 799, ["8", "10", "12"]],
      ["38SD073505-ACI", "Spyder Schatzi Jacket 2026", "Acai", 649, ["10"]],
      ["38SD073509-SDN", "Spyder Vida Jacket 2026", "Sanddune", 699, ["12"]],
      ["38SD475302-BLK2", "Spyder Strutt Bib Soft 2026", "Black", 449, ["10"]],
      ["38SD475306-BLK2", "Spyder Orb Pant 2026", "Black", 329, ["8", "10", "12"]],
    ];
    const products: CsvProduct[] = lines.map(([sku, title, colour, rrp, sizes]) => ({
      handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title, vendor: "Spyder", productType: "Snow Clothing", option1Name: "Colour", option2Name: "Size", images: [],
      variants: sizes.map((size) => ({ sku, option1Value: colour, option2Value: size, quantity: 1, price: rrp })),
    }));

    // Two colourways of the Leader Jacket share a handle, and every size shares its colourway code.
    const { products: fixed, repairs } = repairForExport(products);
    expect(validateProducts(fixed).filter((i) => i.level === "error")).toEqual([]);
    expect(new Set(fixed.map((p) => p.handle)).size).toBe(fixed.length);
    const skus = fixed.flatMap((p) => p.variants.map((v) => v.sku.toLowerCase()));
    expect(new Set(skus).size).toBe(skus.length);
    // Every price survives untouched: the RRP is what the shop sells at.
    expect(fixed.flatMap((p) => p.variants.map((v) => v.price))).not.toContain(0);
    expect(repairs.length).toBeGreaterThan(0);
  });

  it("is deterministic, so a download can rebuild the same file", () => {
    const build = () => repairForExport([leaderJacket(["M", "L", "XL"]), { ...leaderJacket(["S"]), title: "Other" }]);
    expect(JSON.stringify(build().products)).toBe(JSON.stringify(build().products));
  });
});
