import { describe, expect, it } from "vitest";
import { readInvoiceGrids } from "./invoice";

describe("an order form with one line per size", () => {
  it("reads the size from its own column beside the quantity", () => {
    const grid = [
      ["Item No.", "Description", "Size", "QTY", "RRP"],
      ["V27BLZ170", "BLAZE 94", "170", "3", "1499.99"],
      ["V27BLZ177", "BLAZE 94", "177", "2", "1499.99"],
      ["V27KEN170", "KENDO 88", "170", "", "1449.99"],
    ];
    const read = readInvoiceGrids([{ name: "Order", grid }])!;
    expect(read.lines.map((l) => [l.sku, l.size, l.quantity])).toEqual([["V27BLZ170", "170", 3], ["V27BLZ177", "177", 2]]);
    expect(read.columns.size).toBe("Size");
  });

  it("still reads a size grid as the column headings", () => {
    const grid = [
      ["Item No.", "Description", "RRP", "QTY", "170", "177"],
      ["V27BLZ", "BLAZE 94", "1499.99", "", "1", "2"],
    ];
    const read = readInvoiceGrids([{ name: "Order", grid }])!;
    expect(read.lines.map((l) => [l.size, l.quantity])).toEqual([["170", 1], ["177", 2]]);
    expect(read.columns.size).toBe("the column heading");
  });
});
