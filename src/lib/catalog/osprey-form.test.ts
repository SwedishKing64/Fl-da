import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";
import { readInvoiceGrids } from "./invoice";

// The shape of Osprey's forward order form, written by hand with made-up prices: a form header,
// the delivery months above a QTY / $ TOTAL pair per month, then a row per size with the product
// code, its UPC and the product's name under "Description". A second tab lists the same products'
// price changes, and is bigger.
const HEAD = ["Product Code", "UPC", "Gender", "Description", "Colour", "Size", "Category", "Summer 26 Wholesale Price (ex GST)", "Summer 26 RRP", "QTY", "$ TOTAL", "QTY", "$ TOTAL", "QTY", "$ TOTAL", "QTY TOTAL"];
const form: string[][] = [
  ["OSPREY PACKS SUMMER 2026 FORWARD ORDER FORM"],
  [],
  ["", "", "", "", "", "", "", "", "", "DEL #1", "", "DEL #2", "", "DEL #3", "", "TOTALS"],
  ["", "", "", "", "", "", "", "", "", "2026-09-01", "", "2026-10-01", "", "2026-11-01"],
  ["", "", "", "", "", "", "", "", "", "CUST PO #", "", "CUST PO #", "", "CUST PO #"],
  ["", "", "", "", "", "", "", "", "", "640", "", "630", "", "450"],
  HEAD,
  ["10000001", "0843820100001", "MEN'S", "Exos 58", "Dark Charcoal Grey", "S/M", "Outdoor", "200", "459", "2", "400", "2", "400", "2", "400", "6"],
  ["10000002", "0843820100002", "MEN'S", "Exos 58", "Dark Charcoal Grey", "L/XL", "Outdoor", "200", "459", "", "", "", "", "", "", ""],
  ["10000003", "0843820100003", "WOMEN'S", "Eja Pro 55", "Dale Grey/Poinsettia Red", "WM/L", "Outdoor", "250", "499", "1", "250", "", "", "", "", "1"],
  ["10000004", "0843820100004", "MEN'S", "Aether 65", "Black", "S/M", "Outdoor", "280", "559", "", "", "", "", "", "", ""],
];
const changes: string[][] = [
  ["Product Code", "UPC", "Gender", "Description", "Colour", "Size", "Summer 26 Wholesale Price (ex GST)", "Summer 26 RRP", "Winter 26 Wholesale Price (ex GST)", "Winter 26 RRP", "Wholesale Difference (ex GST)", "RRP Difference"],
  ...Array.from({ length: 12 }, (_, i) => [`1000010${i}`, `08438201001${i}`, "M", `Pack ${i}`, "Black", "S/M", "100", "199", "95", "189", "5", "10"]),
];

async function workbook(): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Summer 26 Order Form ").addRows(form);
  book.addWorksheet("Summer 26 Price Changes").addRows(changes);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("Osprey's forward order form", () => {
  it("reads each line's name from Description, never the UPC beside the product code", () => {
    const read = readInvoiceGrids([{ name: "Summer 26 Order Form ", grid: form }, { name: "Summer 26 Price Changes", grid: changes }])!;
    expect(read.shape).toBe("flat");
    expect(read.columns).toMatchObject({ title: "Description", barcode: "UPC", sku: "Product Code" });
    expect(read.lines.map((l) => [l.title, l.barcode, l.size, l.gender, l.quantity, l.costPrice, l.rrp])).toEqual([
      ["Exos 58", "0843820100001", "S/M", "MEN'S", 6, 200, 459],
      ["Eja Pro 55", "0843820100003", "WM/L", "WOMEN'S", 1, 250, 499],
    ]);
  });

  it("hands the column mapping the order tab under its own headings, every delivery added up", async () => {
    const table = await extractXlsx(await workbook());
    expect(table.headers.slice(0, 9)).toEqual(HEAD.slice(0, 9));
    expect(table.headers).toEqual(expect.arrayContaining(["Units", "Due 2026-09", "Due 2026-10", "Due 2026-11"]));
    const ordered = table.rows.filter((r) => Number(r.Units) > 0);
    expect(ordered.map((r) => [r.Description, r.Size, r.Units])).toEqual([["Exos 58", "S/M", "6"], ["Eja Pro 55", "WM/L", "1"]]);
    expect(ordered[0]["Due 2026-10"]).toBe("2");
  });
});
