import { describe, expect, it } from "vitest";
import { cleanName, readGridForm, sizeFor } from "./grid-form";
import { readInvoiceGrids } from "./invoice";

// A distributor's order tab written out by hand, in the layout of the shop's Black Crows form
// (2026-10-19): no item codes, the sizes numbered across the top and each model's own lengths in
// its name. The figures are made up.
const SKIS = [
  ["CLIENT:", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["HARDGOODS", "HARDGOODS", "Waist Width", "RRP", "pre-order", "EX-STOCK +10%", "Size 1", "Size 2", "Size 3", "Size 4", "Size 5", "Size 6", "Total Quantity", "Total Amount"],
  ["ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS", "ALL TERRAIN SKIS"],
  ["OCTO (167, 173, 179, 185)", "", "84", "1000", "500", "550", "", "", "", "", "", "", "", ""],
  ["SATO (167, 173, 179, 185) NEW", "", "88", "1000", "500", "550", "", "1", "1", "", "", "", "2", "1000"],
  ["MIRUS COR (160, 168, 173, 178, 184)  UNI", "MIRUS COR (160, 168, 173, 178, 184)  UNI", "87", "1100", "550", "605", "", "1", "2", "2", "", "", "5", "2750"],
  ["PILUS SKINS", "", "", "RRP", "W/S", "", "Size 1 (S)", "Size 2 (M)", "Size 3 (L)", "Size 4", "Size 5", "Size 6", "TOTAL", "AMOUNT"],
  ["PILUS pre cut CAMOX FREEBIRD (157,164, 171,178,183,188)", "", "PAIR WITH SKI", "400", "200", "220", "", "1", "2", "", "", "", "3", "600"],
  ["PILUS TRIM-TO-FIT NEW", "", "TRIM TO FIT", "400", "200", "220", "1", "", "", "", "", "", "1", "200"],
  ["", "", "", "RRP", "pre-order", "EX-STOCK +10%", "Size 110", "Size 115", "Size 120", "Size 125", "Size 130", "Size 135", "Total Quantity", "Total Amount $"],
  ["POLES", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["META black/orange (110, 115, 120, 125, 130, 135)", "", "", "100", "50", "55", "", "1", "2", "", "", "", "3", "150"],
  // The ex-stock price sits where a quantity would, and is not one.
  ["STANS black/green (110, 115, 120, 125, 130, 135)", "", "", "150", "75", "99", "NA", "NA", "", "", "", "", "", ""],
  ["BACKPACKS", "", "", "RRP", "W/S", "", "", "", "", "", "", "", "", ""],
  ["DORSA 27 olive green", "", "", "300", "150", "165", "", "", "", "", "", "", "", ""],
  ["DORSA 27 BLACK", "", "", "300", "150", "", "1", "", "", "", "", "", "0", ""],
  ["TOTAL excl. GST", "TOTAL excl. GST", "TOTAL excl. GST", "", "", "", "", "", "", "", "", "", "", "9999"],
];

const BINDINGS = [
  ["Shop/Delivery Address:"],
  ["ATK W25.26 BINDINGS", "ATK W25.26 BINDINGS", "ATK W25.26 BINDINGS"],
  ["product code", "RAIDER EVO FREETOURING", "colour", "release", "weight", "RRP", "75mm", "80mm", "86mm", "91mm", "97mm", "102mm", "TOTAL", "W/S", "Pre Order", "total value"],
  ["", "RAIDER 11 EVO BLACK - 370 GR", "black", "4 - 11", "370g", "1000", "", "", "", "", "1", "1", "2", "500", "0", "1000"],
  ["", "RAIDER 11 EVO WHITE- 370 GR", "white", "4 - 11", "370g", "1000", "", "", "", "", "", "", "", "500", "0", ""],
];

describe("an order form of size grids, with no item codes", () => {
  it("reads each size box as a line, at the length the model lists for that box", () => {
    const read = readGridForm("1. W26 BLACK CROWS", SKIS)!;
    const lines = read.lines.map((l) => [l.title, l.size ?? "", l.quantity, l.colour ?? ""]);
    expect(lines).toEqual([
      ["SATO", "173", 1, ""], ["SATO", "179", 1, ""],
      ["MIRUS COR", "168", 1, ""], ["MIRUS COR", "173", 2, ""], ["MIRUS COR", "178", 2, ""],
      ["Pilus Pre Cut Camox Freebird", "164", 1, ""], ["Pilus Pre Cut Camox Freebird", "171", 2, ""],
      ["PILUS TRIM-TO-FIT", "S", 1, ""],
      ["META", "115", 1, "black/orange"], ["META", "120", 2, "black/orange"],
      ["DORSA 27", "", 1, "Black"],
    ]);
    // The units add up to the form's own totals: 2 + 5 skis, 3 + 1 skins, 3 poles, and the pack.
    expect(read.lines.reduce((n, l) => n + (l.quantity ?? 0), 0)).toBe(15);
  });

  it("keeps the prices, the brand from the tab, and the section as the kind", () => {
    const sato = readGridForm("1. W26 BLACK CROWS", SKIS)!.lines[0];
    expect([sato.brand, sato.kind, sato.rrp, sato.costPrice]).toEqual(["Black Crows", "ALL TERRAIN SKIS", 1000, 500]);
    const mirus = readGridForm("1. W26 BLACK CROWS", SKIS)!.lines[2];
    expect(mirus.gender).toBe("Unisex");
  });

  it("reads sizes written across the top, the colour column, and the tab's own title as the kind", () => {
    const read = readGridForm("2. W26 ATK", BINDINGS)!;
    expect(read.lines.map((l) => [l.brand, l.title, l.colour, l.size, l.quantity, l.costPrice])).toEqual([
      ["ATK", "RAIDER 11 EVO", "black", "97mm", 1, 500],
      ["ATK", "RAIDER 11 EVO", "black", "102mm", 1, 500],
    ]);
    expect(read.lines[0].kind).toMatch(/BINDINGS/);
  });

  it("is what the order reader takes for a workbook of such tabs", () => {
    const read = readInvoiceGrids([{ name: "1. W26 BLACK CROWS", grid: SKIS }, { name: "2. W26 ATK", grid: BINDINGS }])!;
    expect(read.lines).toHaveLength(13);
    expect(read.shape).toBe("grid");
  });
});

describe("a size box, and the model's name", () => {
  it("takes the Nth of the model's own sizes, or what the heading says", () => {
    expect(sizeFor("Size 2", "SATO (167, 173, 179, 185)")).toBe("173");
    expect(sizeFor("Size 1 (S)", "PILUS TRIM-TO-FIT")).toBe("S");
    expect(sizeFor("Size 115", "META red")).toBe("115");
    expect(sizeFor("UNI/75mm", "CANDY 5")).toBe("75mm");
    expect(sizeFor("180CM", "SKI BAG")).toBe("180");
  });

  it("drops the sizes, the markers and the weight from the name, and lifts a colour off its end", () => {
    expect(cleanName("SATO (167, 173, 179, 185) NEW")).toEqual({ title: "SATO", colour: "", unisex: false });
    expect(cleanName("JUSTIS (171, 177, 183, 189) UNI").title).toBe("JUSTIS");
    expect(cleanName("DUOS FREEBIRD black/grey 110-140")).toEqual({ title: "DUOS FREEBIRD", colour: "black/grey", unisex: false });
    expect(cleanName("pack of 3 CIRCA BEANIE - BLACK")).toEqual({ title: "Pack of 3 Circa Beanie", colour: "Black", unisex: false });
    expect(cleanName("HY 13 FREE BLACK", "black").title).toBe("HY 13 FREE");
    expect(cleanName("RAIDER 11 EVO WHITE- 370 GR", "white").title).toBe("RAIDER 11 EVO");
    expect(cleanName("DORSA 22 olive green")).toEqual({ title: "DORSA 22", colour: "olive green", unisex: false });
  });
});

// A boot order form in the layout of the shop's Dalbello one (2026-10-19): an item code, the Mondo
// sizes across the heading row BEFORE the total, the RRP heading only over the first section, and
// the sizes a model comes in saying who it is for. The figures are made up.
const BOOTS = [
  ["", "2026/27 Ski Boots  ORDER FORM", "2026/27 Ski Boots  ORDER FORM"],
  ["", "article no.", "WORLD CUP", "colour", "Sizes", "Liner", "RRP", "225", "235", "245", "255", "265", "Total Qty", "Indent", "W/S", "Ext W/S $"],
  ["", "D0000001.00", "RACER WC", "GREEN/DEEP GREEN", "MP 225 - 265", "COMP", "1000", "", "", "", "", "", "", "425", "500", ""],
  ["", "article no.", "ALL MOUNTAIN", "colour", "Sizes", "Liner", "", "225", "235", "245", "255", "265", "Total Qty", "Indent", "W/S", "Ext W/S $"],
  ["x", "D0000002.10", "CRUISER 110 GW", "Black/Petrol", "MS 245-265", "IF", "800", "", "", "1", "2", "", "3", "340", "400", "1200"],
  ["x", "D0000003.10", "CRUISER 85 W GW", "Black/Berry", "LS 225-265", "IF W", "700", "1", "", "", "", "", "1", "297.5", "350", "350"],
  ["", "", "", "", "", "", "", "", "", "", "", "TOTAL", "4", "", "", ""],
];

describe("a boot order form", () => {
  it("reads the Mondo sizes across the top as boot sizes, with each section's RRP and who it is for", async () => {
    const read = readInvoiceGrids([{ name: "SkiBoots 26", grid: BOOTS }])!;
    expect(read.lines.map((l) => [l.title, l.size, l.quantity, l.rrp, l.costPrice, l.gender, l.kind])).toEqual([
      ["CRUISER 110 GW", "24.5", 1, 800, 340, "Mens", "Ski Boots"],
      ["CRUISER 110 GW", "25.5", 2, 800, 340, "Mens", "Ski Boots"],
      ["CRUISER 85 W GW", "22.5", 1, 700, 297.5, "Womens", "Ski Boots"],
    ]);
    // And into new products as a Size, not a ski's Length.
    const { orderToTable } = await import("./extract/tabular");
    const table = orderToTable(read);
    expect(table.rows.map((r) => [r.Size, r.Length])).toEqual([["24.5", ""], ["25.5", ""], ["22.5", ""]]);
  });

  it("writes a Mondo point as the shop writes the size", async () => {
    const { mondo } = await import("./invoice");
    expect(["245", "260", "195", "120mm"].map(mondo)).toEqual(["24.5", "26", "19.5", "120mm"]);
  });
});
