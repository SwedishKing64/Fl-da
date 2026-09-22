/**
 * Reading their real supplier workbooks as invoices.
 *
 * All three of these came from the shop, they are the files a Volkl build was actually attempted
 * from, and between them they cover the three shapes: an order form, a barcode list and a spec
 * export. Two of the three must NOT read as invoices, which is half of what this is for.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInvoiceGrids, readNumber } from "./invoice";
import { applyInvoice, reconcile } from "./reconcile";
import { sheetGrids } from "./extract/tabular";
import { parseCsv } from "./csv";

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}6c315ebf-Volkl_DECEMBER_RETAIL__2026_order_.xlsx`;
const BARCODES = `${UP}3a776927-Marker_Volkl_New_Barcodes_2627.xlsx`;
const SPECS = `${UP}9a58db18-20260202_PIM_Export_VolklSkis_2627.xlsx`;

describe("reading a number as a supplier writes one", () => {
  it("takes currency and thousands separators off, and refuses anything else", () => {
    expect(readNumber("1099")).toBe(1099);
    expect(readNumber("$1,099.00")).toBe(1099);
    expect(readNumber(" 587.7005347593582 ")).toBe(587.7005347593582);
    expect(readNumber("")).toBeNull();
    expect(readNumber("POA")).toBeNull();
    expect(readNumber("15.0 - 30.0")).toBeNull();
  });
});

describe("their December order form", () => {
  it("reads every category tab and leaves out the tabs restating them", { timeout: 30_000 }, async () => {
    const read = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)));
    expect(read).not.toBeNull();
    // Six category tabs — skis, race skis, bindings, accessories, poles, skins — all one order.
    expect(read!.sheet.split(", ")).toHaveLength(6);
    expect(read!.lines.length).toBeGreaterThan(350);
    // The upload tabs hold the same item numbers again under different headings.
    expect(read!.warnings.join(" ")).toContain("Volkl Ski Upload");
    expect(read!.warnings.join(" ")).toContain("same order written a second way");
  });

  it("takes the recommended retail and never the wholesale or indent price beside it", { timeout: 30_000 }, async () => {
    const read = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)));
    expect(read!.columns.rrp).toBe("RRP");
    expect(read!.columns.sku).toBe("Item No.");
    // W/S and INDENT sit in the next two columns at 53% and 45% of it, and a heading match alone
    // would have been happy to read either as a price to show a customer.
    const comp30 = read!.lines.find((l) => l.sku === "7130Z1.MS");
    expect(comp30?.rrp).toBe(1099);
    expect(comp30?.title).toBe("COMP 30 NG");
    // 51 lines on this order are priced 0 — the system bindings that come with a ski. None of them
    // comes through with a price, and with no quantity on this form either they drop out entirely.
    expect(read!.lines.every((l) => l.rrp === null || l.rrp > 0)).toBe(true);
    expect(read!.lines.some((l) => l.title === "COMP 14 FDT  90MM (w/ plate)")).toBe(false);
  });

  it("names the product column by where it is, because its heading is a section name", { timeout: 30_000 }, async () => {
    const read = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)));
    expect(read!.columns.title).toBe('the column beside "Item No."');
  });
});

describe("what is not an invoice", () => {
  it("does not read a barcode list as one — it has nothing to write", { timeout: 30_000 }, async () => {
    // 1,155 rows of article number, description and EAN. Every key it needs, and no price and no
    // quantity, so there is nothing an import would change.
    expect(readInvoiceGrids(await sheetGrids(readFileSync(BARCODES)))).toBeNull();
  });

  it("does not read a spec export as one", { timeout: 30_000 }, async () => {
    expect(readInvoiceGrids(await sheetGrids(readFileSync(SPECS)))).toBeNull();
  });
});

describe("choosing columns by what is under them", () => {
  const grid = (rows: string[][]) => [{ name: "Sheet1", grid: rows }];

  it("ignores a column called barcode that holds no barcodes", () => {
    // Straight from their spec export: "rental barcode" is a column of the words "not included",
    // and the real one eight columns along is called GTIN.
    const read = readInvoiceGrids(grid([
      ["item", "rental barcode", "GTIN", "RRP"],
      ["A1", "not included", "821264800133", "999"],
      ["A2", "not included", "821264800140", "899"],
    ]));
    expect(read!.columns.barcode).toBe("GTIN");
    expect(read!.lines[0].barcode).toBe("821264800133");
  });

  it("finds a barcode column with no useful heading at all", () => {
    const read = readInvoiceGrids(grid([
      ["item", "Column 2", "qty"],
      ["A1", "9351234500019", "4"],
      ["A2", "9351234500026", "2"],
    ]));
    expect(read!.lines[0].barcode).toBe("9351234500019");
    expect(read!.lines[1].quantity).toBe(2);
  });

  it("leaves out a row that cannot be matched or has nothing to write", () => {
    const read = readInvoiceGrids(grid([
      ["item no.", "description", "rrp", "qty"],
      ["A1", "A ski", "999", "3"],
      ["", "SUBTOTAL", "999", ""],
      ["A2", "Another ski", "", ""],
    ]));
    expect(read!.lines).toHaveLength(1);
    expect(read!.lines[0].sku).toBe("A1");
  });
});


describe("an invoice against the shop's own export", () => {
  const SKIS = `${UP}48bf1557-products_export_1_5.csv`;

  it("falls back to the name, because the two documents share no code at all", { timeout: 30_000 }, async () => {
    // Their December order form identifies 375 lines by Volkl/Marker item code and carries no EAN;
    // the ski export keeps barcodes and almost no SKUs. On barcode and SKU alone this pair matches
    // nothing, which is why the name is the third key — it is the only thing they have in common.
    const invoice = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)))!;
    const r = reconcile(readFileSync(SKIS, "utf8"), invoice.lines);
    expect(r.keys.invoiceBarcodes).toBe(0);
    expect(r.keys.invoiceSkus).toBeGreaterThan(300);
    expect(r.keys.fileBarcodes).toBeGreaterThan(400);

    expect(r.matched.every((m) => m.key === "name")).toBe(true);
    expect(r.matched.map((m) => m.on).sort()).toEqual(["RACETIGER SC BLACK", "RACETIGER SRC", "SHINE 76", "SHINE MT"]);
    // The rest is mostly the shop keeping three seasons of one model: "PEREGRINE MT" is the 2025,
    // the 2026 and the ex-demo, and no line of an order form says which. Refused, and named.
    expect(r.ambiguous.some((a) => a.reason.includes("PEREGRINE MT") && a.reason.includes("matches 3 products"))).toBe(true);
  });

  it("places an invoice built from the export's own barcodes, and writes only what was ticked", () => {
    // The other half: an invoice that does carry EANs, taken from the file itself so the codes are
    // genuinely theirs, run the whole way through — read as a CSV, matched, applied.
    const csv = readFileSync(SKIS, "utf8");
    const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
    const header = grid[0];
    const iB = header.indexOf("Variant Barcodes") >= 0 ? header.indexOf("Variant Barcodes") : header.indexOf("Variant Barcode");
    const iP = header.indexOf("Variant Price");
    // Barcodes that sit on exactly one row. Most of this file's do not: a ski sold with a binding
    // carries the ski's barcode on both the mounted and the unmounted variant, so 457 of its 474
    // barcodes are on more than one row and are deliberately refused.
    const count = new Map<string, number>();
    for (const r of grid.slice(1)) { const b = (r[iB] ?? "").replace(/'/g, "").trim(); if (b) count.set(b, (count.get(b) ?? 0) + 1); }
    const picked = grid.slice(1)
      .filter((r) => (r[iP] ?? "").trim() && count.get((r[iB] ?? "").replace(/'/g, "").trim()) === 1)
      .slice(0, 5);
    expect(picked).toHaveLength(5);

    const sheet = [["EAN No.", "description", "RRP", "QTY"], ...picked.map((r, i) => [r[iB], `Line ${i}`, String(1500 + i), String(i + 1)])];
    const invoice = readInvoiceGrids([{ name: "Invoice", grid: sheet }])!;
    expect(invoice.columns.barcode).toBe("EAN No.");
    expect(invoice.lines).toHaveLength(5);

    const r = reconcile(csv, invoice.lines);
    expect(r.matched).toHaveLength(5);

    // Compare At and the count, not the price — the default, which leaves a sale where it is.
    const out = applyInvoice(csv, r.matched, { rrp: true, quantity: true });
    expect(out.refused).toBeUndefined();
    expect(new Set(out.changes.map((c) => c.column))).toEqual(new Set(["Variant Compare At Price", "Variant Inventory Qty"]));

    // And with the price ticked as well, the price moves too — on the same rows and no others.
    const both = applyInvoice(csv, r.matched, { rrp: true, price: true, quantity: true });
    expect(both.refused).toBeUndefined();
    expect(both.changes.filter((c) => c.column === "Variant Price")).toHaveLength(5);
    expect(both.changes.every((c) => c.after !== "0.00")).toBe(true);
  });
});


describe("a barcode on more than one row", () => {
  it("names the product when the rows are its own variants, and refuses either way", () => {
    // Exactly their package shape: one ski, two binding-fitting variants, one barcode, $55 apart.
    const csv = [
      "Handle,Title,Option1 Value,Variant Barcode,Variant Price,Variant Compare At Price,Variant Inventory Qty",
      "mantra-m7,Mantra M7,Do Not Mount My Bindings,9351234500019,1899.00,,3",
      "mantra-m7,,Please Mount My Bindings,9351234500019,1954.00,,3",
    ].join("\r\n") + "\r\n";
    const r = reconcile(csv, [{ sku: "", barcode: "9351234500019", title: "Mantra M7", costPrice: null, rrp: 1999, quantity: 4 }]);
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous[0].reason).toBe("barcode 9351234500019 is on 2 variants of mantra-m7 — one price cannot belong to both");
  });

  it("says so differently when the rows are different products", () => {
    const csv = [
      "Handle,Title,Variant Barcode,Variant Price",
      "ski-a,Ski A,9351234500019,999.00",
      "ski-b,Ski B,9351234500019,899.00",
    ].join("\r\n") + "\r\n";
    const r = reconcile(csv, [{ sku: "", barcode: "9351234500019", title: "?", costPrice: null, rrp: 1999, quantity: null }]);
    expect(r.ambiguous[0].reason).toContain("across 2 different products");
  });
});
