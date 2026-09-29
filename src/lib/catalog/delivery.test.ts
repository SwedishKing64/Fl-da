/**
 * One delivery, one file: the reorder written onto the export and the new products on the end.
 *
 * Their November Burton delivery is the case this exists for — a spec sheet, an order form with the
 * lines ticked, and the shop's own export, with nobody knowing up front which of forty lines is a
 * carry-over. The numbers below come from the real Volkl December order and the shop's real ski
 * export, because those two files are the same shape and are the ones on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDelivery } from "./delivery";
import { parseCsv } from "./csv";
import type { InvoiceLine } from "./reconcile";

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine =>
  ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...over });

const EXPORT = [
  "Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Barcodes,Variant Price,Variant Compare At Price,Variant Inventory Qty,SEO Title,Status",
  "blaze-94-2027,Blaze 94 2027,<p>A ski.</p>,Volkl,Snow Skis,2027,TRUE,Length,170,,'821264800133,1449.99,1449.99,4,Volkl Blaze 94 2027,active",
  "blaze-94-2027,,,,,,,Length,177,,'821264800140,1449.99,1449.99,2,,",
].join("\r\n") + "\r\n";

describe("a delivery of carry-overs and new products", () => {
  const delivery = () => buildDelivery(EXPORT, [
    line({ barcode: "821264800133", title: "BLAZE 94", size: "170", quantity: 3, rrp: 1499.99 }),
    line({ sku: "V2610112.000", barcode: "4064264900011", title: "M7 MANTRA", size: "170", quantity: 2, rrp: 1649 }),
    line({ sku: "V2610112.000", barcode: "4064264900028", title: "M7 MANTRA", size: "177", quantity: 1, rrp: 1649 }),
  ], { season: "2027", vendor: "Volkl" });

  it("adds the arriving stock to the carry-over rather than replacing it", () => {
    const out = delivery();
    expect(out.refused).toBeUndefined();
    const qty = out.changes.filter((c) => c.column === "Variant Inventory Qty");
    expect(qty).toHaveLength(1);
    expect(qty[0].before).toBe("4");
    expect(qty[0].after).toBe("7");
  });

  it("puts the products the shop does not have on the end of the same file", () => {
    const out = delivery();
    expect(out.fresh).toHaveLength(1);
    expect(out.fresh[0].title).toBe("M7 Mantra 2027");
    expect(out.fresh[0].handle).toBe("m7-mantra-2027");
    expect(out.fresh[0].vendor).toBe("Volkl");
    // Two lengths ordered, so two variant rows — and the barcodes travel with them.
    expect(out.fresh[0].variants.map((v) => v.option)).toEqual(["170", "177"]);
    expect(out.fresh[0].variants.map((v) => v.barcode)).toEqual(["4064264900011", "4064264900028"]);
    expect(out.appended).toBe(2);
  });

  it("leaves every row that was already there exactly as it was, bar the cells it names", () => {
    const out = delivery();
    const before = parseCsv(EXPORT).filter((r) => r.some((c) => c.trim()));
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    expect(after).toHaveLength(before.length + 2);
    expect(after[0]).toEqual(before[0]);                                  // the header, untouched
    expect(after[2]).toEqual(before[2]);                                  // the 177, nothing arriving
    // The 170 moved in exactly two cells, and both are on the change list: the count going up and
    // the recommended retail the invoice corrects.
    const moved = before[1].map((_, i) => i).filter((i) => before[1][i] !== after[1][i]).map((i) => before[0][i]);
    expect(moved).toEqual(["Variant Compare At Price", "Variant Inventory Qty"]);
    expect(out.changes.map((c) => c.column).sort()).toEqual(["Variant Compare At Price", "Variant Inventory Qty"]);
  });

  it("writes the new product as a draft at the supplier's recommended retail", () => {
    const out = delivery();
    const rows = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    const header = rows[0];
    const fresh = rows.slice(-2).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
    expect(fresh[0].Status).toBe("draft");
    expect(fresh[0].Published).toBe("FALSE");
    expect(fresh[0]["Variant Price"]).toBe("1649.00");
    // Not on sale on the day it arrives: the shop's price IS the recommended retail.
    expect(fresh[0]["Variant Compare At Price"]).toBe("");
    expect(fresh[0]["Variant Inventory Qty"]).toBe("2");
    expect(fresh[0]["SEO Title"]).toBe("Volkl M7 Mantra 2027");
    expect(fresh[0]["Option1 Name"]).toBe("Length");
    // The second row of a product carries the handle and the variant, and nothing of the product.
    expect(fresh[1].Handle).toBe("m7-mantra-2027");
    expect(fresh[1].Title).toBe("");
  });

  it("holds back a product whose URL the file already uses, rather than editing that product", () => {
    // A one-word name is the case the matcher cannot place: it needs two words or a model code, so
    // "REVOLT" matches nothing and arrives here as new. Its URL is not new — the shop writes
    // revolt-2027 and this would write volkl-revolt-2027, so only checking the handle it builds
    // would miss it and Shopify would end up with the ski twice. See handlesFor.
    const withRevolt = EXPORT + "revolt-2027,Revolt 2027,<p>A ski.</p>,Volkl,Snow Skis,2027,TRUE,Length,170,,'821264800999,1299.99,1299.99,1,Volkl Revolt 2027,active\r\n";
    const out = buildDelivery(withRevolt, [line({ title: "REVOLT", size: "177", quantity: 1, rrp: 1299.99 })], { season: "2027", vendor: "Volkl" });
    expect(out.reconciliation.unmatched).toHaveLength(1);
    expect(out.fresh).toEqual([]);
    expect(out.appended).toBe(0);
    expect(out.heldBack).toHaveLength(1);
    expect(out.heldBack[0].reason).toContain("revolt-2027 is already in this file under that URL");
    expect(out.csv).toBe(withRevolt);
  });

  it("adds a size the shop has never stocked as a variant of the product that has the others", () => {
    // A ski the shop sells, in a length it has not had. Not a new product and not a count that can
    // go anywhere: the row for it does not exist yet, so this writes one.
    const out = buildDelivery(EXPORT, [line({ title: "BLAZE 94", size: "163", quantity: 2, rrp: 1499.99 })], { season: "2027", vendor: "Volkl" });
    expect(out.freshSizes).toHaveLength(1);
    expect(out.freshSizes[0]).toMatchObject({ handle: "blaze-94-2027", option: "163", quantity: 2 });
    expect(out.fresh).toEqual([]);
    expect(out.appended).toBe(1);

    const rows = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    const cell = Object.fromEntries(rows[0].map((h, i) => [h, rows[rows.length - 1][i] ?? ""]));
    expect(cell.Handle).toBe("blaze-94-2027");
    expect(cell["Option1 Value"]).toBe("163");
    expect(cell["Variant Inventory Qty"]).toBe("2");
    // Copied from a length the product already has, so the new one arrives with the same settings —
    // and with the option's name, which Shopify writes on a product's first row only.
    expect(cell["Option1 Name"]).toBe("Length");
    // And nothing of the PRODUCT, so importing this adds a variant rather than editing the ski.
    expect(cell.Title).toBe("");
    expect(cell["Body (HTML)"]).toBe("");
    expect(cell.Tags).toBe("");
    expect(cell.Status).toBe("");
  });

  it("does not repeat a size the product turns out to have", () => {
    const out = buildDelivery(EXPORT, [line({ title: "BLAZE 94", size: "177", quantity: 2 })], { season: "2027", vendor: "Volkl" });
    expect(out.freshSizes).toEqual([]);
    expect(out.appended).toBe(0);
  });

  it("can be told to do the reorder only", () => {
    const out = buildDelivery(EXPORT, [
      line({ barcode: "821264800133", quantity: 3 }),
      line({ title: "M7 MANTRA", size: "170", quantity: 2, rrp: 1649 }),
    ], { season: "2027", vendor: "Volkl", reorderOnly: true });
    expect(out.appended).toBe(0);
    expect(out.changes.filter((c) => c.column === "Variant Inventory Qty")).toHaveLength(1);
  });
});

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}206de565-Volkl_DECEMBER_RETAIL__2026_order_.xlsx`;
const SKIS = `${UP}48bf1557-products_export_1_5.csv`;

describe.skipIf(!existsSync(ORDER) || !existsSync(SKIS))("against the real order form and the real export", () => {
  // Reading a real workbook and matching it against a 1.1MB export is a few seconds of work.
  it("splits the order into what the shop has and what it does not, and only grows the file", { timeout: 60_000 }, async () => {
    const { sheetGrids } = await import("./extract/tabular");
    const { readInvoiceGrids } = await import("./invoice");
    const read = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)))!;
    expect(read.lines.length).toBeGreaterThan(0);
    // The ticked cells, not the 375-model price list the same form carries.
    expect(read.lines.length).toBeLessThan(60);

    const csv = readFileSync(SKIS, "utf8");
    const out = buildDelivery(csv, read.lines, { season: "2027", vendor: "Volkl" });
    expect(out.refused).toBeUndefined();

    const before = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    expect(after).toHaveLength(before.length + out.appended);
    expect(after[0]).toEqual(before[0]);

    // Every cell of every row that was there already, except the ones the change list names.
    const named = new Set(out.changes.map((c) => `${c.handle}\u0000${c.column}`));
    const handleAt = before[0].indexOf("Handle");
    for (let r = 1; r < before.length; r++) {
      for (let c = 0; c < before[0].length; c++) {
        if ((before[r][c] ?? "") === (after[r][c] ?? "")) continue;
        expect(named.has(`${(before[r][handleAt] ?? "").trim()}\u0000${before[0][c]}`)).toBe(true);
      }
    }

    // Nothing arriving ever lowers a count.
    for (const change of out.changes.filter((c) => c.column === "Variant Inventory Qty")) {
      expect(Number(change.after)).toBeGreaterThan(Number(change.before || 0));
    }

    // And every line is accounted for: written onto a row, built, or named as held back.
    const placed = out.carryOver.length + out.fresh.reduce((n, f) => n + f.variants.length, 0) + out.heldBack.length;
    expect(placed).toBe(read.lines.length);

    // Eight of the nine ticked lines are skis the shop already sells; the ninth is a Marker
    // binding, which is not in a Volkl ski export and is the only thing built. Two of the eight
    // are lengths it has never had, so they arrive as variants of the ski that has the others.
    expect(out.carryOver).toHaveLength(8);
    expect(out.fresh.map((f) => f.title)).toEqual(["Griffon 13 MN; 100mm 2027"]);
    expect(out.freshSizes.map((f) => `${f.option} of ${f.handle}`)).toEqual(["158 of blaze-94-2027", "138 of mantra-junior-2025"]);
    // Read off the carry-overs: all 452 Volkl products in this export are Type "Skis", and the
    // order form does not contain the word "ski" anywhere.
    expect(out.fresh[0].type).toBe("Skis");
  });
});
