import { describe, expect, it } from "vitest";
import { deduceColumns, isBarcode, isColour, isSize, notNames } from "./columns";
import { readInvoiceGrids } from "./invoice";
import { suggestMapping } from "./mapping";

// One small order, three suppliers' ways of laying it out. Barcodes carry real check digits.
const LINES = [
  ["10004715", "0843820149319", "Exos Pro 55", "Dale Grey/Agam Blue", "L/XL", "MEN'S", "252.04", "499", "1"],
  ["10004717", "0843820149357", "Eja Pro 55", "Dale Grey/Poinsettia Red", "WM/L", "WOMEN'S", "252.04", "499", "1"],
  ["10007051", "0810165740471", "Exos 58", "Dark Charcoal Grey", "S/M", "MEN'S", "231.84", "459", "6"],
  ["10007052", "0810165740495", "Exos 58", "Dark Charcoal Grey", "L/XL", "MEN'S", "231.84", "459", "4"],
  ["10006685", "0843820199505", "Ariel 65", "Koseret Green", "WXS/S", "WOMEN'S", "282.35", "559", "2"],
];
const layout = (order: number[], headings: string[]) => [headings, ...LINES.map((l) => order.map((i) => l[i]))];

describe("telling columns apart by what is in them", () => {
  it("knows a barcode by its check digit, and sizes and colours by what they say", () => {
    expect(isBarcode("0843820149319")).toBe(true);
    expect(isBarcode("0843820149318")).toBe(false);
    expect(["S/M", "L/XL", "WXS/S", "XL", "O/S", "177", "27.5", "9.5"].every(isSize)).toBe(true);
    expect(["168/173/178", "Exos 58", "Black"].some(isSize)).toBe(false);
    expect(isColour("Dale Grey/Agam Blue")).toBe(true);
    expect(notNames(["0843820149319", "0843820149357", "10007051"])).toBe(true);
  });

  it("finds the same columns however the supplier lays them out", () => {
    const forms = [
      // Code, barcode, name: the name is NOT beside the code.
      layout([0, 1, 2, 3, 4, 5, 6, 7, 8], ["Product Code", "UPC", "Description", "Colour", "Size", "Gender", "Wholesale", "RRP", "QTY"]),
      // Name first, barcode last, nothing headed helpfully.
      layout([2, 0, 3, 4, 5, 6, 7, 8, 1], ["EXOS / EJA", "Ref", "Col", "Sz", "Who", "Cost", "Retail", "Qty", "Code 2"]),
      // No headings at all.
      layout([5, 3, 0, 2, 1, 4, 6, 7, 8], ["", "", "", "", "", "", "", "", ""]),
    ];
    const names = forms.map((grid) => {
      const roles = deduceColumns(grid[0], grid.slice(1));
      const at = (i: number) => (i >= 0 ? grid[1][i] : null);
      return [at(roles.name), at(roles.barcode), at(roles.size), at(roles.colour), at(roles.gender), at(roles.code)];
    });
    for (const found of names) expect(found).toEqual(["Exos Pro 55", "0843820149319", "L/XL", "Dale Grey/Agam Blue", "MEN'S", "10004715"]);
  });

  it("reads an order form's lines with the name from its contents, not from where it sits", () => {
    // A section heading over the name column ("EXOS / EJA"), the barcode beside the item code.
    const grid = [["Item No.", "UPC", "EXOS / EJA", "Colour", "Size", "QTY", "RRP"], ...LINES.map((l) => [l[0], l[1], l[2], l[3], l[4], l[8], l[7]])];
    const read = readInvoiceGrids([{ name: "Order", grid }])!;
    expect(read.lines.map((l) => [l.title, l.barcode, l.size, l.quantity])[0]).toEqual(["Exos Pro 55", "0843820149319", "L/XL", 1]);
  });

  it("does not suggest a column of barcodes as the product name, and finds the name instead", () => {
    const headers = ["Code", "Description", "Range"];
    const rows = LINES.map((l) => ({ Code: l[0], Description: l[1], Range: l[2] }));
    const mapping = suggestMapping(headers, rows);
    expect(mapping.Description).not.toBe("title");
    expect(mapping.Range).toBe("title");
    expect(mapping.Description).toBe("barcode");
  });
});
