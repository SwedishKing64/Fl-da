/**
 * The file that will be imported, compared with the one that was loaded.
 *
 * Every assertion here is about the FILE rather than about what the tool meant to do, which is the
 * point of having this at all — the change list and the file agreeing is a claim worth checking
 * against the bytes.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diffCsv } from "./diff";
import { buildDelivery } from "./delivery";
import { applyPlan } from "./adjust";
import type { InvoiceLine } from "./reconcile";

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine =>
  ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...over });

const EXPORT = [
  "Handle,Title,Vendor,Type,Tags,Option1 Name,Option1 Value,Variant Barcodes,Variant Price,Variant Compare At Price,Variant Inventory Qty,Status",
  "blaze-94-2027,Blaze 94 2027,Volkl,Skis,2027,Length,170,'821264800133,1449.99,1449.99,4,active",
  "blaze-94-2027,,,,,Length,177,'821264800140,1449.99,1449.99,2,",
  "m7-mantra-2027,M7 Mantra 2027,Volkl,Skis,2027,Length,177,'821264800200,1599.99,1599.99,1,active",
].join("\r\n") + "\r\n";

describe("comparing the two files", () => {
  it("names the cells that moved, and only those", () => {
    const out = applyPlan(EXPORT, { scope: { handles: ["blaze-94-2027"] }, operations: [{ kind: "discount", percent: 20 }] });
    const d = diffCsv(EXPORT, out.csv);
    expect(d.problem).toBe("");
    expect(d.columns).toEqual(["Variant Price"]);
    expect(d.changedRows).toBe(2);
    expect(d.changedCells).toBe(2);
    expect(d.untouched).toBe(1);
    expect(d.addedRows).toBe(0);
    expect(d.rows[0].cells[0]).toEqual({ column: "Variant Price", before: "1449.99", after: "1159.99" });
  });

  it("carries the product's name onto a variant row, which does not have one", () => {
    // Shopify writes a Title on a product's first row and leaves the rest blank, so the row for
    // the 177 says nothing about which ski it is.
    const out = applyPlan(EXPORT, { scope: { handles: ["blaze-94-2027"] }, operations: [{ kind: "discount", percent: 20 }] });
    const d = diffCsv(EXPORT, out.csv);
    expect(d.rows.map((r) => `${r.title} ${r.option}`)).toEqual(["Blaze 94 2027 170", "Blaze 94 2027 177"]);
  });

  it("shows a row written on the end as added, not as a wall of changed cells", () => {
    const out = buildDelivery(EXPORT, [line({ title: "M7 MANTRA", size: "184", quantity: 2, rrp: 1599.99 })], { season: "2027", vendor: "Volkl" });
    const d = diffCsv(EXPORT, out.csv);
    expect(d.addedRows).toBe(1);
    const added = d.rows.filter((r) => r.kind === "added");
    expect(added).toHaveLength(1);
    expect(added[0].handle).toBe("m7-mantra-2027");
    expect(added[0].option).toBe("184");
    // Its own filled cells, so a new row can be read rather than counted.
    expect(added[0].added?.find((c) => c.column === "Variant Inventory Qty")?.value).toBe("2");
    expect(added[0].cells).toEqual([]);
  });

  it("says so rather than comparing two files that are not the same file", () => {
    const other = "Handle,Title\r\nblaze-94-2027,Blaze 94 2027\r\n";
    expect(diffCsv(EXPORT, other).problem).toContain("do not have the same columns");
  });

  it("refuses to show a diff when rows have gone missing", () => {
    // Nothing on this page removes a row. If one is gone, every row after it has slid up by one and
    // a diff would read as thousands of changes — so it says what happened instead.
    const short = EXPORT.split("\r\n").filter((_, i) => i !== 2).join("\r\n");
    expect(diffCsv(EXPORT, short).problem).toContain("fewer rows");
  });

  it("finds nothing when nothing happened", () => {
    expect(diffCsv(EXPORT, EXPORT).rows).toEqual([]);
  });
});

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}206de565-Volkl_DECEMBER_RETAIL__2026_order_.xlsx`;
const SKIS = `${UP}48bf1557-products_export_1_5.csv`;

describe.skipIf(!existsSync(ORDER) || !existsSync(SKIS))("a real delivery, read off the file it produced", () => {
  it("accounts for every row of a 1,819-row export", { timeout: 60_000 }, async () => {
    const { sheetGrids } = await import("./extract/tabular");
    const { readInvoiceGrids } = await import("./invoice");
    const read = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)))!;
    const csv = readFileSync(SKIS, "utf8");
    const out = buildDelivery(csv, read.lines, { season: "2027", vendor: "Volkl" });
    const d = diffCsv(csv, out.csv);

    expect(d.problem).toBe("");
    // Two columns out of forty-eight, which is why the preview shows the columns that moved and
    // not the file: a season's change touches a handful of them.
    expect(d.columns).toEqual(["Variant Inventory Qty", "Variant Compare At Price"]);
    expect(d.changedRows).toBe(11);
    expect(d.addedRows).toBe(3);
    const { parseCsv } = await import("./csv");
    const rowsInFile = parseCsv(csv).filter((r) => r.some((c) => c.trim())).length - 1;
    expect(d.changedRows + d.untouched).toBe(rowsInFile);

    // The change list and the file agree, cell for cell. That is the claim this exists to check.
    expect(d.changedCells).toBe(out.changes.length);
    const fromFile = new Set(d.rows.flatMap((r) => r.cells.map((c) => `${r.handle}\u0000${c.column}\u0000${c.before}\u0000${c.after}`)));
    for (const change of out.changes) {
      expect(fromFile.has(`${change.handle}\u0000${change.column}\u0000${change.before}\u0000${change.after}`)).toBe(true);
    }

    // And every added row is one of the two things a delivery adds: a size, or a product.
    const added = d.rows.filter((r) => r.kind === "added");
    expect(added.map((r) => `${r.option} of ${r.handle}`)).toEqual([
      "158 of blaze-94-2027",
      "138 of mantra-junior-2025",
      "Default Title of griffon-13-mn-100mm-2027",
    ]);
  });
});
