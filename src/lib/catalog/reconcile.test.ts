/**
 * Matching an invoice to products the shop already sells.
 *
 * The join key is the barcode, and that is a measurement rather than a preference: across their
 * ten exports, of 4,659 variant rows only 154 carry a SKU (3.3%) while 3,982 carry a barcode
 * (85.5%). A matcher built on SKUs — which is the usual assumption — would have matched almost
 * nothing on this shop's data.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyInvoice, normaliseBarcode, reconcile, type InvoiceLine } from "./reconcile";
import { parseCsv } from "./csv";

const EXPORT = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/48bf1557-products_export_1_5.csv";
/** Their snow-clothing export: Karbon, Oakley and Quiksilver, 140 products in 648 variant rows. */
const EXPORT_TEXT = readFileSync("/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/a2c0583c-products_export-6.csv", "utf8");

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine =>
  ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...over });

const CSV = [
  "Handle,Title,Variant SKU,Variant Barcodes,Variant Price,Variant Compare At Price,Variant Inventory Qty",
  "blaze-94,Blaze 94,,'821264800133,1449.99,,4",
  "blaze-94,,,'821264800140,1449.99,,2",
  "mantra-m7,Mantra M7,MAN-177,,1599.99,,1",
].join("\r\n") + "\r\n";

describe("normalising a barcode", () => {
  it("drops the apostrophe an export carries", () => {
    expect(normaliseBarcode("'821264800133")).toBe("821264800133");
  });

  it("reads a 12-digit UPC and its 13-digit EAN as the same article", () => {
    // A supplier quotes whichever its system holds; they differ by exactly that leading zero.
    expect(normaliseBarcode("0887445533047")).toBe(normaliseBarcode("887445533047"));
  });

  it("refuses anything that is not a long enough run of digits", () => {
    expect(normaliseBarcode("n/a")).toBe("");
    expect(normaliseBarcode("1234")).toBe("");
    expect(normaliseBarcode("")).toBe("");
  });
});

describe("matching", () => {
  it("finds a variant by barcode", () => {
    const r = reconcile(CSV, [line({ barcode: "821264800140", rrp: 1599 })]);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].key).toBe("barcode");
    expect(r.matched[0].handle).toBe("blaze-94");
  });

  it("falls back to the SKU for the few rows that carry one", () => {
    const r = reconcile(CSV, [line({ sku: "man-177", rrp: 1699 })]);
    expect(r.matched[0]?.key).toBe("sku");
    expect(r.matched[0]?.handle).toBe("mantra-m7");
  });

  it("carries the handle down the continuation rows of a product", () => {
    // Only the first row of a handle names it; the rest belong to the same product.
    const r = reconcile(CSV, [line({ barcode: "821264800140" })]);
    expect(r.matched[0].handle).toBe("blaze-94");
  });

  it("says a line matched nothing rather than putting it somewhere", () => {
    const r = reconcile(CSV, [line({ barcode: "999999999999" })]);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toHaveLength(1);
  });

  it("refuses a barcode the export carries twice", () => {
    const dupe = CSV.replace("'821264800140", "'821264800133");
    const r = reconcile(dupe, [line({ barcode: "821264800133", rrp: 1 })]);
    expect(r.matched).toEqual([]);
    // Both rows are variants of the one product, which is the shape their package listings take.
    expect(r.ambiguous[0].reason).toMatch(/on 2 variants of blaze-94/);
  });

  it("refuses a barcode the invoice itself lists twice", () => {
    const r = reconcile(CSV, [line({ barcode: "821264800133", rrp: 1 }), line({ barcode: "821264800133", rrp: 2 })]);
    expect(r.matched).toEqual([]);
    expect(r.ambiguous).toHaveLength(2);
    expect(r.ambiguous[0].reason).toMatch(/2 lines of the invoice/);
  });
});

describe("writing the invoice's numbers", () => {
  const matched = reconcile(CSV, [line({ barcode: "821264800133", rrp: 1699.99, quantity: 9 })]).matched;

  it("writes only the fields asked for", () => {
    const out = applyInvoice(CSV, matched, { rrp: true });
    expect(out.changes.map((c) => c.column)).toEqual(["Variant Compare At Price"]);
    expect(out.changes[0].after).toBe("1699.99");
  });

  it("writes the price and the quantity when those are asked for", () => {
    const out = applyInvoice(CSV, matched, { price: true, quantity: true, stock: "set" });
    const cols = out.changes.map((c) => c.column);
    expect(cols).toContain("Variant Price");
    expect(cols).toContain("Variant Inventory Qty");
    expect(out.changes.find((c) => c.column === "Variant Inventory Qty")?.after).toBe("9");
  });

  // A delivery ADDS. The row holds 4 and the invoice brings 9, so the shop has 13 — writing the
  // invoice's 9 into the cell would quietly lose the four already on the shelf.
  it("adds an arriving count to the stock already there, by default", () => {
    const out = applyInvoice(CSV, matched, { quantity: true });
    expect(out.changes.find((c) => c.column === "Variant Inventory Qty")?.before).toBe("4");
    expect(out.changes.find((c) => c.column === "Variant Inventory Qty")?.after).toBe("13");
  });

  it("treats an empty stock cell as none, not as a reason to skip", () => {
    const none = [
      "Handle,Title,Variant Barcodes,Variant Inventory Qty",
      "blaze-94,Blaze 94,'821264800133,",
    ].join("\r\n") + "\r\n";
    const m = reconcile(none, [line({ barcode: "821264800133", quantity: 3 })]).matched;
    expect(applyInvoice(none, m, { quantity: true }).changes[0].after).toBe("3");
  });

  it("refuses to add to a stock cell that is not a count, and says which", () => {
    const odd = [
      "Handle,Title,Variant Barcodes,Variant Inventory Qty",
      "blaze-94,Blaze 94,'821264800133,on order",
    ].join("\r\n") + "\r\n";
    const m = reconcile(odd, [line({ barcode: "821264800133", quantity: 3 })]).matched;
    const out = applyInvoice(odd, m, { quantity: true });
    expect(out.changes).toEqual([]);
    expect(out.warnings.join(" ")).toContain("not a count");
  });

  it("leaves every other row of the file exactly as it was", () => {
    const out = applyInvoice(CSV, matched, { rrp: true, price: true, quantity: true });
    const before = parseCsv(CSV).filter((r) => r.some((c) => c.trim()));
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    expect(after).toHaveLength(before.length);
    expect(after[2]).toEqual(before[2]);   // the second Blaze length
    expect(after[3]).toEqual(before[3]);   // the Mantra
    expect(out.refused).toBeUndefined();
  });

  it("changes nothing when the invoice already agrees with the file", () => {
    const same = reconcile(CSV, [line({ barcode: "821264800133", rrp: 1449.99 })]).matched;
    expect(applyInvoice(CSV, same, { price: true }).changes).toEqual([]);
  });

  it("says so when the export has no column for what was asked", () => {
    const thin = "Handle,Title,Variant Barcodes\r\nblaze-94,Blaze 94,'821264800133\r\n";
    const m = reconcile(thin, [line({ barcode: "821264800133", quantity: 3 })]).matched;
    expect(applyInvoice(thin, m, { quantity: true }).warnings.join(" ")).toMatch(/no "Variant Inventory Qty" column/);
  });
});

describe("against the shop's real ski export", () => {
  it("matches on the barcodes that are actually in it", () => {
    const csv = readFileSync(EXPORT, "utf8");
    const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
    const bcCol = grid[0].indexOf("Variant Barcodes");
    // Take three barcodes that appear exactly once, the way a supplier would quote them.
    const counts = new Map<string, number>();
    for (const r of grid.slice(1)) {
      const b = normaliseBarcode(r[bcCol] ?? "");
      if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const unique = [...counts].filter(([, n]) => n === 1).slice(0, 3).map(([b]) => b);
    expect(unique.length).toBe(3);

    const r = reconcile(csv, unique.map((b) => line({ barcode: b, rrp: 1234.56 })));
    expect(r.matched).toHaveLength(3);
    expect(r.matched.every((m) => m.key === "barcode" && m.handle)).toBe(true);

    const out = applyInvoice(csv, r.matched, { rrp: true });
    expect(out.refused).toBeUndefined();
    expect(out.changes).toHaveLength(3);
    expect(out.changes.every((c) => c.after === "1234.56")).toBe(true);
  });
});

/**
 * Matching on the name, for the invoices that carry no barcode.
 *
 * Their Volkl order form has 375 lines and not one EAN, and a Swany invoice names its goods the
 * way the shop does. This is the loose key, so these are mostly tests of what it REFUSES.
 */
describe("matching by name", () => {
  const GLOVES = [
    "Handle,Title,Option1 Value,Variant SKU,Variant Barcode,Variant Price,Variant Compare At Price,Variant Inventory Qty",
    "swany-sx-2m,SX-2M Gore-Tex Glove,S,,,199.00,,4",
    "swany-sx-2m,,M,,,199.00,,6",
    "swany-sx-2m,,L,,,199.00,,2",
    "swany-x-cell,X-Cell Mitt,M,,,249.00,,3",
  ].join("\r\n") + "\r\n";
  const named = (title: string, over: Partial<InvoiceLine> = {}): InvoiceLine =>
    ({ sku: "", barcode: "", title, costPrice: null, rrp: 229, quantity: 12, ...over });

  it("places a model code on the product whose name carries it", () => {
    const r = reconcile(GLOVES, [named("SX-2M")]);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].key).toBe("name");
    expect(r.matched[0].handle).toBe("swany-sx-2m");
    // The name is the product, so it is every size of it.
    expect(r.matched[0].rows).toHaveLength(3);
  });

  it("does not care how the code is punctuated, because the two documents will not agree", () => {
    for (const written of ["SX-2M", "sx 2m", "SX2M", "Swany SX-2M Glove"]) {
      expect(reconcile(GLOVES, [named(written)]).matched[0]?.handle).toBe("swany-sx-2m");
    }
  });

  it("matches whole tokens only, never a substring", () => {
    // The trap this exists for: CH8 and CH10 are two waxes on their shelf.
    const r = reconcile(GLOVES, [named("SX-2")]);
    expect(r.matched).toHaveLength(0);
  });

  it("refuses a name that fits two products rather than picking one", () => {
    const twice = GLOVES.replace("swany-x-cell,X-Cell Mitt", "swany-sx-2m-w,SX-2M Womens");
    const r = reconcile(twice, [named("SX-2M")]);
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous[0].reason).toContain("matches 2 products");
  });

  it("refuses a name two lines of the invoice both give", () => {
    const r = reconcile(GLOVES, [named("SX-2M", { rrp: 199 }), named("SX-2M", { rrp: 249 })]);
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous[0].reason).toContain("2 lines of the invoice");
  });

  it("never matches the binding a package is sold with", () => {
    // "Peregrine 82 2026 inc Lowride 13 FR Binding Package" is a SKI. An invoice line for the
    // Lowride binding must not land on it, and would have on whichever ski was the only one
    // naming that binding.
    const skis = [
      "Handle,Title,Variant Price",
      "peregrine-82-2026-inc-lowride-13-fr-binding-package,Peregrine 82 2026 inc Lowride 13 FR Binding Package,1499.00",
    ].join("\r\n") + "\r\n";
    expect(reconcile(skis, [named("LOWRIDE 13 FR")]).matched).toHaveLength(0);
    expect(reconcile(skis, [named("Peregrine 82")]).matched).toHaveLength(1);
  });

  it("writes the price to every size and leaves the count alone, saying why", () => {
    const r = reconcile(GLOVES, [named("SX-2M", { rrp: 229, quantity: 12 })]);
    const out = applyInvoice(GLOVES, r.matched, { rrp: true, quantity: true });
    expect(out.refused).toBeUndefined();
    // One recommended retail across the sizes is how they already price them.
    expect(out.changes.filter((c) => c.column === "Variant Compare At Price")).toHaveLength(3);
    // One count across three sizes would invent 36 gloves out of 12.
    expect(out.changes.filter((c) => c.column === "Variant Inventory Qty")).toHaveLength(0);
    expect(out.warnings.join(" ")).toContain("invents stock");
  });

  it("writes the count when the line says which size it is for", () => {
    const r = reconcile(GLOVES, [named("SX-2M", { size: "M", quantity: 12 })]);
    expect(r.matched[0].rows).toHaveLength(1);
    const out = applyInvoice(GLOVES, r.matched, { quantity: true, stock: "set" });
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].after).toBe("12");
  });

  it("falls back to the whole product when the size is not one the shop stocks", () => {
    const r = reconcile(GLOVES, [named("SX-2M", { size: "XXL" })]);
    expect(r.matched[0].rows).toHaveLength(3);
  });

  it("prefers an exact barcode over a name, when the line has both", () => {
    const withCode = GLOVES.replace("swany-x-cell,X-Cell Mitt,M,,,", "swany-x-cell,X-Cell Mitt,M,,9351234500019,");
    const r = reconcile(withCode, [named("SX-2M", { barcode: "9351234500019" })]);
    expect(r.matched[0].key).toBe("barcode");
    expect(r.matched[0].handle).toBe("swany-x-cell");
  });
});

describe("matching by name against their real catalogue", () => {
  it("places 115 of 140 snow-clothing products with nothing on the wrong one", () => {
    // Their Karbon/Oakley/Quiksilver export, the closest thing loaded to a Swany glove invoice:
    // an invoice line per product, named the way the shop names it and carrying no code at all.
    // What matters is not the 115 — it is that none of them landed on a different product.
    const grid = parseCsv(EXPORT_TEXT).filter((r) => r.some((c) => c.trim() !== ""));
    const header = grid[0];
    const iT = header.indexOf("Title"), iH = header.indexOf("Handle");
    const handleOfTitle = new Map<string, string>();
    for (const row of grid.slice(1)) {
      const handle = (row[iH] ?? "").trim(), title = (row[iT] ?? "").trim();
      if (handle && title && !handleOfTitle.has(title)) handleOfTitle.set(title, handle);
    }
    const lines: InvoiceLine[] = [...handleOfTitle.keys()].map((title) => ({ sku: "", barcode: "", title, costPrice: null, rrp: 199, quantity: 5 }));
    expect(lines.length).toBe(140);

    const r = reconcile(EXPORT_TEXT, lines);
    expect(r.matched.length).toBeGreaterThan(110);
    expect(r.matched.filter((m) => handleOfTitle.get(m.line.title) !== m.handle)).toEqual([]);
    // The rest are refused, never guessed: the same model in two colours or two seasons.
    expect(r.matched.length + r.ambiguous.length + r.unmatched.length).toBe(140);
  });
});

/**
 * The Swany reorder, which is the invoice this was built for.
 *
 * Rush Distribution invoice 11372 against their Swany export, both real. It is a SIZE GRID: five
 * products, each with a row of sizes and a count under each, which arrives as twelve lines where
 * five share a code with another. Reading a shared code as a clash refused the whole invoice and
 * reported that each product appeared twice, which it does not.
 */
describe("a size-grid invoice", () => {
  const SWANY = readFileSync("/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/1f150258-Swany_CSV_OLD.csv", "utf8");
  const grid = (sku: string, title: string, rrp: number, sizes: Array<[string, number]>): InvoiceLine[] =>
    sizes.map(([size, quantity]) => ({ sku, barcode: "", title, costPrice: null, rrp, quantity, size, colour: "BK" }));
  const INVOICE: InvoiceLine[] = [
    ...grid("SX-1M-BK", "X-Cell Glove Men's", 229.99, [["8.0-M", 1], ["9.0-L", 2]]),
    ...grid("SX-2M-BK", "X-Cell Mitt Men's", 229.99, [["8.0-M", 1], ["9.0-L", 1]]),
    ...grid("SX-44AM-BK", "X-Cell Mitt Men's 10% Off", 229.99, [["9.5-XL", 1]]),
    ...grid("SX-20M-BK", "X-Change Glove Men's", 179.99, [["8.0-M", 1], ["9.0-L", 2], ["9.5-XL", 1], ["8.5-ML", 1]]),
    ...grid("SX-34L-BK", "Falcon Glove Ladies", 149.99, [["6.5-S", 2], ["7.0-M", 2], ["7.5-L", 1]]),
  ];

  it("places every line, and a code on two lines of different sizes is not a clash", () => {
    const r = reconcile(SWANY, INVOICE);
    expect(r.ambiguous).toEqual([]);
    expect(r.unmatched).toEqual([]);
    expect(r.matched).toHaveLength(12);
    // Each code found the product whose title carries it — the codes live in their titles.
    const where = new Map(r.matched.map((m) => [`${m.line.sku} ${m.line.size}`, m.handle]));
    expect(where.get("SX-1M-BK 8.0-M")).toBe("x-cell-glove-mens");
    expect(where.get("SX-2M-BK 9.0-L")).toBe("x-cell-mitt-mens");
    expect(where.get("SX-44AM-BK 9.5-XL")).toBe("sx-44am-x-cell-mitt-mens");
    expect(where.get("SX-20M-BK 9.5-XL")).toBe("x-change-glove-mens");
    expect(where.get("SX-34L-BK 7.0-M")).toBe("falcon-glove-ladies-sx-34l");
  });

  it("reads the invoice's sizes against the shop's, which are written the other way round", () => {
    // "8.0-M" on the invoice is "M (8)" in Shopify, and the SX-44AM mitt has no mondopoint at all
    // — it is S, M, ML, L, XL, 2XL — so "9.5-XL" has to land on it by the letter.
    const r = reconcile(SWANY, INVOICE);
    const narrowed = r.matched.filter((m) => m.rows.length === 1);
    expect(narrowed).toHaveLength(11);
    // The one that is not: the invoice orders an 8.5-ML of a glove listed only in S, M, L and XL.
    const wide = r.matched.find((m) => m.rows.length > 1)!;
    expect(wide.line.size).toBe("8.5-ML");
    expect(wide.sizeMissing).toBe(true);
  });

  it("picks the colourway out of a product that comes in two", () => {
    // The Falcon glove is Black and Washed Voilet, three sizes each. "SX-34L-BK" is the black one,
    // and their own options spell the abbreviation out elsewhere as "Black (BK)".
    const r = reconcile(SWANY, INVOICE);
    const falcon = r.matched.filter((m) => m.handle === "falcon-glove-ladies-sx-34l");
    expect(falcon).toHaveLength(3);
    expect(falcon.every((m) => m.rows.length === 1)).toBe(true);
    expect(new Set(falcon.flatMap((m) => m.rows)).size).toBe(3);
  });

  it("writes each count to its own size, and the corrected retail across the product", () => {
    const r = reconcile(SWANY, INVOICE);
    const out = applyInvoice(SWANY, r.matched, { rrp: true, quantity: true, stock: "set" });
    expect(out.refused).toBeUndefined();

    // Ten counts for eleven narrowed lines: the X-Change glove in M (8) already says 1 in the
    // shop and the invoice says 1, and a cell that already holds the value is not a change.
    const counts = out.changes.filter((c) => c.column === "Variant Inventory Qty");
    expect(counts).toHaveLength(10);

    // One price is wrong in the shop: the SX-44AM mitt is at 219.99 and the invoice says 229.99.
    // All seven of its rows carry the same old price, so the correction moves as one — leaving six
    // sizes on the old number because the line happened to be for the XL would be a mess to find.
    const prices = out.changes.filter((c) => c.column === "Variant Compare At Price");
    expect(new Set(prices.map((c) => c.handle))).toEqual(new Set(["sx-44am-x-cell-mitt-mens"]));
    expect(prices).toHaveLength(7);
    expect(prices.every((c) => c.before === "219.99" && c.after === "229.99")).toBe(true);

    // And the size the listing does not have is named rather than passed over.
    expect(out.warnings.join(" ")).toContain("8.5-ML");
  });

  it("adds this delivery to the counts the shop already holds", () => {
    const r = reconcile(SWANY, INVOICE);
    const out = applyInvoice(SWANY, r.matched, { quantity: true });
    expect(out.refused).toBeUndefined();
    const counts = out.changes.filter((c) => c.column === "Variant Inventory Qty");
    // Eleven now, not ten: the X-Change glove in M (8) holds 1 and one more is arriving, which is
    // a change to 2 where setting the invoice's own 1 would have been no change at all.
    expect(counts).toHaveLength(11);
    // Nothing went down, and the shop gained exactly what the invoice says is arriving on the
    // lines it could place on one size.
    expect(counts.every((c) => Number(c.after) > Number(c.before || 0))).toBe(true);
    const gained = counts.reduce((n, c) => n + Number(c.after) - Number(c.before || 0), 0);
    const ordered = r.matched.filter((m) => m.rows.length === 1).reduce((n, m) => n + (m.line.quantity ?? 0), 0);
    expect(gained).toBe(ordered);
  });

  it("leaves a price alone where the product's sizes are priced differently", () => {
    // Their wax is 26.99 for the small tin and 35.99 for the large. A line for one size must not
    // hand its price to the other, which is why the widening above is conditional.
    const wax = [
      "Handle,Title,Option1 Value,Variant Price,Variant Compare At Price",
      "ch8-wax,CH8 Wax,60g,26.99,32.99",
      "ch8-wax,,180g,35.99,41.99",
    ].join("\r\n") + "\r\n";
    const r = reconcile(wax, [{ sku: "", barcode: "", title: "CH8 Wax", costPrice: null, rrp: 34.99, quantity: null, size: "60g" }]);
    expect(r.matched[0].rows).toHaveLength(1);
    const out = applyInvoice(wax, r.matched, { rrp: true });
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].before).toBe("32.99");
  });
});
