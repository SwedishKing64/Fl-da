import { describe, expect, it } from "vitest";
import { csvType } from "./pipeline-pure";
import { productTypes, typeLeaves } from "./taxonomy";

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
    // With nothing to go on it answers with where the shop puts gloves — 127 of the 129 pairs in
    // its exports are Ski Accessories — rather than with a shelf name or the first menu entry.
    expect(csvType("Gloves", [])).toBe("Ski Accessories");
  });

  it("never writes a value that is not a heading, for any type the app can produce", () => {
    // Every type the taxonomy admits must map to something a heading-only column would accept.
    const headings = new Set(productTypes().filter((t) => csvType(t, []) === t));
    for (const type of productTypes()) expect(headings.has(csvType(type, []))).toBe(true);
  });

  it("passes through something it has never heard of rather than blanking the column", () => {
    expect(csvType("Hovercraft", [])).toBe("Hovercraft");
    expect(csvType("", [])).toBe("");
  });
});

/**
 * Where the shop files the things you wear, as against where the menu lists them.
 *
 * The menu hangs Goggles, Helmets and Gloves under both Ski Accessories and Snowboard Accessories.
 * The shop does not use it that way: in its own exports all 27 goggles, all 10 snow helmets and
 * 127 of 129 pairs of gloves are typed Ski Accessories. Snowboard Accessories is a real heading
 * with 37 products on it — stomp pads, leashes, tuning — and nothing anyone wears.
 *
 * An Oakley helmet went out typed Snowboard Accessories, because "Helmets" hangs only under that
 * heading in the menu while the shop's own word for it is "Ski Helmets".
 */
describe("snow accessories", () => {
  it("files a helmet, goggles and gloves under Ski Accessories", () => {
    for (const shelf of ["Helmets", "Ski Helmets", "Goggles", "Gloves", "Ski Gloves", "Mitts"]) {
      expect(csvType(shelf, [])).toBe("Ski Accessories");
    }
  });

  it("leaves a climbing helmet where it belongs", () => {
    expect(csvType("Climbing Helmets", [])).toBe("Climbing & Abseiling");
  });

  it("still lets the product's own collection put it on the snowboard shelf", () => {
    // The tie-break stays: someone who files a helmet under Snowboard Accessories gets that.
    expect(csvType("Helmets", ["Snowboard Accessories"])).toBe("Snowboard Accessories");
  });

  it("does not touch a heading that is only ever itself", () => {
    for (const heading of ["Snowboard Bindings", "Snowboard Boots", "Snowboards", "Skis"]) {
      expect(csvType(heading, [])).toBe(heading);
    }
  });

  it("uses only headings the shop actually has", () => {
    // Every Type this can produce has to be one of the menu's headings — the fault that started
    // this was a value invented from a leaf.
    const headings = new Set(Object.keys(typeLeaves()));
    for (const shelf of ["Helmets", "Goggles", "Gloves", "Snow Jackets", "Snow Pants", "Ski Poles", "Ski Tuning"]) {
      expect(headings.has(csvType(shelf, []))).toBe(true);
    }
  });
});
