/**
 * Reading a supplier's workbook.
 *
 * Driven against the three real Volkl files, because both faults here only show up on a workbook
 * a supplier actually sends: neither could be reproduced by a file written to demonstrate them.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectHeaderRow, extractXlsx } from "./tabular";

const D = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const PIM = `${D}9a58db18-20260202_PIM_Export_VolklSkis_2627.xlsx`;
const BARCODES = `${D}3a776927-Marker_Volkl_New_Barcodes_2627.xlsx`;
const ORDER = `${D}6c315ebf-Volkl_DECEMBER_RETAIL__2026_order_.xlsx`;

describe("which row the column names are on", () => {
  it("takes the widest row, not the first one with three words in it", () => {
    // A supplier order sheet opens with a letterhead. Every one of these lines has three text
    // cells, and the old rule handed the whole sheet back one column wide.
    const grid = [
      ["Customer:", "Alpsport", "", ""],
      ["Address:", "5 Chaplin Drive", "", ""],
      ["Suburb:", "Lane Cove West", "email:", "nick@example.com"],
      ["Item No.", "Description", "System", "Sizes", "RRP", "W/S", "Indent"],
      ["V2610001", "Racetiger GS", "WC Plate", "168/173", "2249", "1202", "1022"],
    ];
    expect(detectHeaderRow(grid)).toBe(3);
  });

  it("is not fooled by a title merged across every column", () => {
    // A merged banner arrives as the same phrase repeated in each cell it spans — wider than the
    // header below it, and not a header.
    const banner = Array(8).fill("2025/26 Ski Price-List");
    const grid = [banner, ["Item No.", "Description", "System", "Sizes", "RRP", "W/S"], ["V1", "Racetiger", "WC", "168", "2249", "1202"]];
    expect(detectHeaderRow(grid)).toBe(1);
  });

  it("still finds a header on the first row of an ordinary file", () => {
    expect(detectHeaderRow([["Handle", "Title", "Vendor"], ["a", "b", "c"]])).toBe(0);
  });
});

describe("the real Volkl files", () => {
  // A twelve-sheet workbook takes a few seconds to parse, which is past the default timeout.
  it("reads the PIM export: every column, every length", { timeout: 30_000 }, async () => {
    const t = await extractXlsx(readFileSync(PIM));
    expect(t.headers).toContain("basic article no.");
    expect(t.headers).toContain("GTIN");
    expect(t.headers).toContain("size (ski length)");
    expect(t.rows.length).toBeGreaterThan(400);
    expect(t.rows[0]["basic article no."]).toBe("V2510056");
    expect(t.rows[0]["GTIN"]).toBe("821264800133");
  });

  it("reads the barcode list", { timeout: 30_000 }, async () => {
    const t = await extractXlsx(readFileSync(BARCODES));
    expect(t.headers).toEqual(["article no.", "description", "CTN", "net weight", "country of origin", "EAN No."]);
    expect(t.rows.length).toBeGreaterThan(1000);
    expect(t.rows[0]["EAN No."]).toBe("883295505555");
  });

  it("reads the order, not the price list it is printed on", { timeout: 30_000 }, async () => {
    // Twelve sheets, 375 models priced across them, and a delivery of nine. Read as a table this
    // built the supplier's whole range as new stock; read as an order it builds what was bought.
    const t = await extractXlsx(readFileSync(ORDER));
    expect(t.headers).toEqual(["Item No.", "SKU", "Brand", "Description", "Colour", "Length", "RRP", "Cost", "Qty"]);
    expect(t.rows).toHaveLength(9);
    expect(t.rows[0]["Item No."]).toBe("V2610112.000");
    expect(t.rows[0]["Description"]).toBe("M7 MANTRA");
    // The per-length SKU is the join the other two files land on.
    expect(t.rows[0]["SKU"]).toBe("V2610112.000.170");
    expect(t.warnings.join(" ")).toContain("Read as an order");
  });

  it("names the tabs the order came off", { timeout: 30_000 }, async () => {
    const t = await extractXlsx(readFileSync(ORDER));
    const note = t.warnings.join(" ");
    expect(note).toContain("Volkl Ski");
    expect(note).toContain("Marker Inline 2025");
    expect(note).toMatch(/price list, not this delivery/i);
  });

  it("still reads a named sheet as a plain table", { timeout: 30_000 }, async () => {
    // Asking for one by name is how a price list is read out of the same workbook.
    const t = await extractXlsx(readFileSync(ORDER), "Volkl Ski Upload");
    expect(t.headers).toEqual(["Supplier Code", "Code", "Size", "Qty", "Type"]);
    expect(t.rows.length).toBeGreaterThan(400);
  });

  it("reads a named sheet when one is asked for", { timeout: 30_000 }, async () => {
    const t = await extractXlsx(readFileSync(ORDER), "Marker Inline Upload");
    expect(t.rows.length).toBeGreaterThan(100);
  });
});
