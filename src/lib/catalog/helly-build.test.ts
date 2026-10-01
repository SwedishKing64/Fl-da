/**
 * Helly Hansen's 2027W order form: a column of Units and a column of W/S $ for every delivery month
 * from November to June, the quantities written in whichever months the shop wants the goods (Dec 26
 * and Jun 27) and a TOTALS pair at the end.
 *
 * Reported from the shop floor: "it couldn't read the quantities". The reader took the first Units
 * column, which holds a single 0 — so a form with 64 ordered lines read as having none.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractXlsx, sheetGrids } from "./extract/tabular";
import { foldQuantityColumns, readInvoiceGrids } from "./invoice";
import { applyMapping, suggestMapping } from "./mapping";
import { keepOrderedLines } from "./reference-match";
import { colourName } from "./colour";
import { buildDelivery } from "./delivery";

const FILE = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/217a04cd-Helly_Hansen_Dec_26_and_June_27_orders.xlsx";
const EXPORT = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/c4918aef-products_export_1-6.csv";

describe("a quantity column per delivery month", () => {
  const head = ["EAN", "Style Name", "Size", "RRP", "Units", "W/S $", "Units", "W/S $", "Units", "W/S $"];
  const months = ["", "", "", "", "2026-12-01", "2026-12-01", "2027-06-01", "2027-06-01", "TOTALS", "TOTALS"];

  it("takes the form's own TOTALS column", () => {
    const grid = [months, head, ["7042040699045", "ALPHA JACKET", "M", "850", "", "", "1", "386", "1", "386"], ["7042040699038", "ALPHA JACKET", "L", "850", "1", "386", "1", "386", "2", "772"], ["7042040699069", "ALPHA JACKET", "XL", "850", "", "", "", "", "", ""]];
    const { grid: out, note } = foldQuantityColumns(grid, 1);
    expect(out.slice(2).map((r) => r[4])).toEqual(["1", "2", ""]);
    expect(note).toMatch(/TOTALS/);
  });

  it("adds the months together when there is no total", () => {
    const grid = [head, ["1", "A", "M", "850", "1", "386", "2", "772", "", ""]];
    expect(foldQuantityColumns(grid, 0).grid[1][4]).toBe("3");
  });

  it("leaves a single quantity column exactly as it is", () => {
    const grid = [["EAN", "Qty", "RRP"], ["1", "4", "9"]];
    expect(foldQuantityColumns(grid, 0).grid).toBe(grid);
  });
});

describe("a supplier's colour code", () => {
  it("is not part of the colour", () => {
    expect(colourName("627 BRIGHT BLUE")).toBe("Bright Blue");
    expect(colourName("990 BLACK")).toBe("Black");
    expect(colourName("Washed Navy")).toBe("Washed Navy");
    expect(colourName("2 Tone Grey")).toBe("2 Tone Grey");   // a code is two or more digits; one is part of the name
  });
});

describe.skipIf(!existsSync(FILE))("the Helly Hansen order, both ways in", () => {
  it("imports the 64 ordered lines, with barcode, colour, size, cost and RRP", { timeout: 60_000 }, async () => {
    const t = await extractXlsx(readFileSync(FILE));
    const m = suggestMapping(t.headers, t.rows);
    expect(m["Color Description"]).toBe("colour");
    expect(m["Wholesale Price (EX GST)"]).toBe("costPrice");
    const kept = keepOrderedLines(t.rows.map((r) => ({ item: applyMapping(r, m), fileId: "o" }))).kept.map((k) => k.item);
    expect(kept).toHaveLength(64);
    expect(kept.reduce((n, i) => n + (i.quantity ?? 0), 0)).toBe(73);
    expect(kept[0]).toMatchObject({ title: "ALPHA LIFALOFT JACKET", colour: "Dark Blue", size: "M", barcode: "7042040699045", rrp: 850 });
    expect(kept[0].costPrice).toBeCloseTo(386.36, 2);
  });

  it("reads the same 64 on the Bulk page, and leaves out the pivot summary tab", { timeout: 60_000 }, async () => {
    const read = readInvoiceGrids(await sheetGrids(readFileSync(FILE)))!;
    expect(read.lines).toHaveLength(64);
    expect(read.lines.reduce((n, l) => n + (l.quantity ?? 0), 0)).toBe(73);
    expect(read.warnings.join(" ")).toMatch(/Style Breakdown.*summary/);
    // The size, not the "Size Order" sort key (200, 240, 270); the name, not the product code.
    expect(read.lines[0]).toMatchObject({ title: "ALPHA LIFALOFT JACKET", size: "M", sku: "65667_507-M", colour: "Dark Blue" });
  });

  it.skipIf(!existsSync(EXPORT))("builds them as new products with a colour and a size, the brand tag and every barcode", { timeout: 60_000 }, async () => {
    const read = readInvoiceGrids(await sheetGrids(readFileSync(FILE)))!;
    const out = buildDelivery(readFileSync(EXPORT, "utf8"), read.lines, { season: "2027", vendor: "Helly Hansen", priceList: read.priceList });
    expect(out.fresh).toHaveLength(13);
    const jacket = out.fresh.find((f) => f.title === "Alpha Lifaloft Jacket 2027")!;
    expect(jacket.type).toBe("Snow Clothing");
    expect(jacket.tags).toEqual(expect.arrayContaining(["helly-hansen", "mens", "2027", "snow jackets"]));
    expect(jacket.variants[0]).toMatchObject({ option: "Dark Blue / M", barcode: "7042040699045" });
    expect(out.fresh.flatMap((f) => f.variants).every((v) => v.barcode !== "")).toBe(true);
  });
});
