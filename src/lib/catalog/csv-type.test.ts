import { describe, expect, it } from "vitest";
import { csvType } from "./pipeline-pure";
import { PRODUCT_TYPES } from "./taxonomy";

/**
 * The Shopify Type column takes the menu heading, not the shelf under it.
 *
 * Checked against the shop's own nine exports: of 827 products, every one of the 673 that carries
 * a Type carries a heading. 46 of the 47 whose title says jacket or pant read "Snow Clothing" (the
 * 47th is a climbing product), and "Snow Jackets" occurs as a Type exactly nowhere.
 *
 * The categoriser deliberately names the shelf — that is what the grid shows and what the shelf
 * tag is built from — so the mapping up has to happen when the column is written, and it did not.
 * A Spyder jacket went out typed "Snow Jackets", a value the shop has never used.
 */
describe("the Type column", () => {
  it("files every garment under Snow Clothing", () => {
    for (const shelf of ["Snow Jackets", "Snow Pants", "Snow Socks", "Baselayers"]) {
      expect(csvType(shelf, [])).toBe("Snow Clothing");
    }
  });

  it("leaves a heading alone", () => {
    for (const heading of ["Snow Clothing", "Skis", "Snowboards", "Snowboard Boots", "Ski Accessories"]) {
      expect(csvType(heading, [])).toBe(heading);
    }
  });

  it("lets the product's own collection break a tie", () => {
    // Gloves hang under two headings; the collection says which shelf this pair is on.
    expect(csvType("Gloves", ["Snowboard Accessories"])).toBe("Snowboard Accessories");
    expect(csvType("Gloves", ["Clothing Accessories"])).toBe("Clothing Accessories");
    // With nothing to go on it still answers, rather than writing a shelf into the column.
    expect(["Clothing Accessories", "Snowboard Accessories"]).toContain(csvType("Gloves", []));
  });

  it("never writes a value that is not a heading, for any type the app can produce", () => {
    // Every type the taxonomy admits must map to something a heading-only column would accept.
    const headings = new Set(PRODUCT_TYPES.filter((t) => csvType(t, []) === t));
    for (const type of PRODUCT_TYPES) expect(headings.has(csvType(type, []))).toBe(true);
  });

  it("passes through something it has never heard of rather than blanking the column", () => {
    expect(csvType("Hovercraft", [])).toBe("Hovercraft");
    expect(csvType("", [])).toBe("");
  });
});
