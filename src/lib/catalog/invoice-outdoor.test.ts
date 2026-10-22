import { describe, expect, it } from "vitest";
import { isSizeHeading, readInvoiceGrids } from "./invoice";

describe("isSizeHeading", () => {
  it("knows the sizes clothing, footwear, packs and sleeping bags are headed with", () => {
    for (const h of ["XS", "s", "M", "XL", "XXL", "2XL", "S/M", "M/L", "L-XL", "US 9.5", "UK 8", "EU 42", "8", "8.5", "10", "OS", "O/S", "One Size", "Regular", "Long", "148", "26.5"]) {
      expect(isSizeHeading(h), h).toBe(true);
    }
  });
  it("does not take a column of the row's own for a size", () => {
    for (const h of ["RRP", "Wholesale", "Total", "Colour", "Description", "Qty", "Style #", "Disc %", ""]) {
      expect(isSizeHeading(h), h).toBe(false);
    }
  });
});

describe("an outdoor order form laid out as a size grid", () => {
  it("reads a clothing grid with letter sizes and no quantity column: one line per size ordered", () => {
    const grid = [
      ["Outdoor Agencies Pty Ltd", "", "", "", "", "", "", "", "", "", ""],
      ["Style #", "Style Name", "Colour", "Wholesale", "RRP", "XS", "S", "M", "L", "XL", "Total"],
      ["25528", "Better Sweater Jacket", "Black", "99.50", "199.95", "", "1", "2", "", "", "3"],
      ["84212", "Nano Puff Jacket", "Navy", "129.00", "259.95", "1", "", "", "1", "", "2"],
      ["84213", "Nano Puff Vest", "Navy", "99.00", "199.95", "", "", "", "", "", ""],
    ];
    const read = readInvoiceGrids([{ name: "Order", grid }]);
    expect(read?.shape).toBe("grid");
    const lines = read!.lines.map((l) => [l.sku, l.title, l.colour, l.size, l.quantity, l.costPrice, l.rrp]);
    expect(lines).toEqual([
      ["25528", "Better Sweater Jacket", "Black", "S", 1, 99.5, 199.95],
      ["25528", "Better Sweater Jacket", "Black", "M", 2, 99.5, 199.95],
      ["84212", "Nano Puff Jacket", "Navy", "XS", 1, 129, 259.95],
      ["84212", "Nano Puff Jacket", "Navy", "L", 1, 129, 259.95],
    ]);
  });

  it("reads a footwear grid headed with US sizes and half sizes", () => {
    const grid = [
      ["Style", "Description", "Colour", "Cost", "RRP", "US 8", "US 8.5", "US 9", "US 9.5", "Total"],
      ["J035001", "Moab 3 Mid GTX", "Walnut", "120", "279.99", "", "1", "1", "", "2"],
    ];
    const read = readInvoiceGrids([{ name: "Footwear", grid }]);
    expect(read!.lines.map((l) => [l.size, l.quantity])).toEqual([["US 8.5", 1], ["US 9", 1]]);
  });

  it("reads pack sizes across the top", () => {
    const grid = [
      ["SKU", "Name", "Colour", "W/S", "RRP", "S/M", "L/XL"],
      ["10004001", "Atmos AG 65", "Black", "250", "499.95", "1", "1"],
    ];
    expect(readInvoiceGrids([{ name: "Packs", grid }])!.lines.map((l) => l.size)).toEqual(["S/M", "L/XL"]);
  });

  it("leaves a plain invoice to the column matcher, which keeps every column", () => {
    const grid = [
      ["SKU", "Description", "Barcode", "Qty", "Unit Price"],
      ["10004001", "Atmos AG 65 Black S/M", "843820100001", "2", "250"],
    ];
    const read = readInvoiceGrids([{ name: "Invoice", grid }]);
    expect(read?.shape).not.toBe("grid");
  });
});
