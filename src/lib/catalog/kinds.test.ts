import { describe, expect, it } from "vitest";
import { KIND_NOT_SAID, kindOfLine, kindsAsked, tidyKind, typesByBarcode } from "./kinds";

describe("the kinds of product on an order, for doing one at a time", () => {
  const onOrder = ["Snowboards", "Snowboard Bindings", "Snowboard Boots", "Gloves", "Jackets"];

  it("reads which kinds an instruction keeps, by name or by their own word", () => {
    expect(kindsAsked("only the snowboards", onOrder)).toEqual(["Snowboards"]);
    expect(kindsAsked("just do the boards for now", onOrder)).toEqual(["Snowboards"]);
    expect(kindsAsked("boards and bindings only", onOrder)).toEqual(["Snowboards", "Snowboard Bindings"]);
    expect(kindsAsked("leave out the gloves", onOrder)).toEqual(["Snowboards", "Snowboard Bindings", "Snowboard Boots", "Jackets"]);
    expect(kindsAsked("only the gloves and the jackets", onOrder)).toEqual(["Gloves", "Jackets"]);
    // "snowboard" is three kinds' word, so on its own it names none of them.
    expect(kindsAsked("only the snowboard stuff", onOrder)).toBeNull();
    // Not about kinds at all.
    expect(kindsAsked("10% off everything", onOrder)).toBeNull();
    expect(kindsAsked("only the 2026 delivery", onOrder)).toBeNull();
    // One kind on the order is nothing to choose between.
    expect(kindsAsked("only the snowboards", ["Snowboards"])).toBeNull();
  });

  it("takes a line's kind from the form, else from the listing its barcode lands on, else says so", () => {
    const types = typesByBarcode([
      { productType: "Snowboards", barcodes: ["9010510000011", "9010510000028"] },
      { productType: "Gloves", barcodes: ["9010510000035"] },
      { productType: "", barcodes: ["9010510000042"] },
    ]);
    expect(kindOfLine({ kind: "SNOWBOARDS", barcode: "" }, types)).toBe("Snowboards");
    expect(kindOfLine({ kind: "", barcode: "'9010510000035" }, types)).toBe("Gloves");
    expect(kindOfLine({ barcode: "9010510000042" }, types)).toBe(KIND_NOT_SAID);
    expect(kindOfLine({ barcode: "" }, types)).toBe(KIND_NOT_SAID);
  });

  it("writes an upper-case kind the way the shop writes a Type", () => {
    expect(tidyKind("SNOWBOARD BINDINGS")).toBe("Snowboard Bindings");
    expect(tidyKind("MENS/WOMENS")).toBe("Mens/Womens");
    expect(tidyKind("Snowboard Boots")).toBe("Snowboard Boots");
  });
});
