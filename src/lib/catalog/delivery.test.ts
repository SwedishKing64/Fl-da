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
import { alignRows } from "./diff";
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
    // The ski, and its package with the Marker Griffon: every flat ski is built both ways.
    expect(out.fresh.map((f) => f.title)).toEqual(["M7 Mantra 2027", "M7 Mantra 2027 inc Marker Griffon Binding Package"]);
    expect(out.fresh[0].title).toBe("M7 Mantra 2027");
    expect(out.fresh[0].handle).toBe("m7-mantra-2027");
    expect(out.fresh[0].vendor).toBe("Volkl");
    // Two lengths ordered, so two variant rows — and the barcodes travel with them.
    expect(out.fresh[0].variants.map((v) => v.option)).toEqual(["170", "177"]);
    expect(out.fresh[0].variants.map((v) => v.barcode)).toEqual(["4064264900011", "4064264900028"]);
    // Two rows for the ski, and two lengths × Do Not Mount / Please Mount for the package.
    expect(out.appended).toBe(6);
    expect(out.fresh[1].variants.map((v) => v.price)).toEqual(["2099.00", "2154.00", "2099.00", "2154.00"]);
  });

  it("leaves every row that was already there exactly as it was, bar the cells it names", () => {
    const out = delivery();
    const before = parseCsv(EXPORT).filter((r) => r.some((c) => c.trim()));
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    expect(after).toHaveLength(before.length + 6);
    expect(after[0]).toEqual(before[0]);                                  // the header, untouched
    expect(after[2]).toEqual(before[2]);                                  // the 177, nothing arriving
    // The 170 moved in exactly three cells, and all are on the change list: the count going up,
    // the recommended retail the invoice corrects, and the product going into draft to be looked at.
    const moved = before[1].map((_, i) => i).filter((i) => before[1][i] !== after[1][i]).map((i) => before[0][i]);
    expect(moved).toEqual(["Variant Compare At Price", "Variant Inventory Qty", "Status"]);
    expect(out.changes.map((c) => c.column).sort()).toEqual(["Status", "Variant Compare At Price", "Variant Inventory Qty"]);
  });

  it("writes the new product as a draft at the supplier's recommended retail", () => {
    const out = delivery();
    const rows = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    const header = rows[0];
    const fresh = rows.slice(3, 5).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
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

  it("writes the description, details and pictures of a linked page onto the new product and its package", () => {
    const pages = { 1: { description: "The M7 Mantra is for everything.", features: ["Radius: 20 m", "Core: Woodcore"], images: ["https://cdn.example.com/m7/a.jpg", "https://cdn.example.com/m7/b.jpg"], pageTitle: "M7 Mantra", confident: true, sourceUrl: "https://www.volkl.example.com/m7", via: "ai" as const, note: "" } };
    // An export with the picture columns, as the shop's real ones have.
    const withPictures = EXPORT.replace("SEO Title,Status", "SEO Title,Status,Image Src,Image Position");
    const out = buildDelivery(withPictures, [
      line({ barcode: "821264800133", title: "BLAZE 94", size: "170", quantity: 3, rrp: 1499.99 }),
      line({ sku: "V2610112.000", barcode: "4064264900011", title: "M7 MANTRA", size: "170", quantity: 2, rrp: 1649 }),
      line({ sku: "V2610112.000", barcode: "4064264900028", title: "M7 MANTRA", size: "177", quantity: 1, rrp: 1649 }),
    ], { season: "2027", vendor: "Volkl", pages });
    const rows = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    const header = rows[0];
    const col = (name: string) => header.indexOf(name);
    const mine = rows.filter((r) => r[col("Handle")].startsWith("m7-mantra-2027"));
    const first = (handle: string) => mine.find((r) => r[col("Handle")] === handle && r[col("Title")])!;
    for (const handle of ["m7-mantra-2027", "m7-mantra-2027-inc-marker-griffon-binding-package"]) {
      const row = first(handle);
      expect(row[col("Body (HTML)")]).toBe("<p>The M7 Mantra is for everything.</p>\n<h2>Tech Specs</h2>\n<ul>\n<li>Radius: 20 m</li>\n<li>Core: Woodcore</li>\n</ul>");
      const pictures = mine.filter((r) => r[col("Handle")] === handle && r[col("Image Src")]).map((r) => r[col("Image Src")]);
      expect(pictures).toEqual(["https://cdn.example.com/m7/a.jpg", "https://cdn.example.com/m7/b.jpg"]);
    }
    expect(out.fresh.every((f) => f.described)).toBe(true);
    // And without a page, exactly as before: nothing described, no pictures.
    const bare = parseCsv(buildDelivery(withPictures, [
      line({ sku: "V2610112.000", barcode: "4064264900011", title: "M7 MANTRA", size: "170", quantity: 2, rrp: 1649 }),
    ], { season: "2027", vendor: "Volkl" }).csv).filter((r) => r.some((c) => c.trim()));
    expect(bare.slice(1).filter((r) => r[col("Image Src")]).length).toBe(0);
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
    const out = buildDelivery(csv, read.lines, { season: "2027", vendor: "Volkl", priceList: read.priceList });
    expect(out.refused).toBeUndefined();

    const before = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    expect(after).toHaveLength(before.length + out.appended);
    expect(after[0]).toEqual(before[0]);

    // Every cell of every row that was there already, except the ones the change list names. A row
    // is found again by its product: a new length moves up to sit with its ski (see alignRows).
    const named = new Set(out.changes.map((c) => `${c.handle}\u0000${c.column}`));
    const handleAt = before[0].indexOf("Handle");
    const aligned = alignRows(before, after);
    for (let r = 1; r < before.length; r++) {
      for (let c = 0; c < before[0].length; c++) {
        if ((before[r][c] ?? "") === (after[aligned[r]][c] ?? "")) continue;
        expect(named.has(`${(before[r][handleAt] ?? "").trim()}\u0000${before[0][c]}`)).toBe(true);
      }
    }

    // Nothing arriving ever lowers a count.
    for (const change of out.changes.filter((c) => c.column === "Variant Inventory Qty")) {
      expect(Number(change.after)).toBeGreaterThan(Number(change.before || 0));
    }

    // And every line is accounted for: written onto a row, built, or named as held back.
    // (A binding package is built beside a new ski, from no line of its own, so it is not counted.)
    const placed = out.carryOver.length + out.fresh.filter((f) => !/\binc\b.*\bpackage\b/i.test(f.title)).reduce((n, f) => n + f.variants.length, 0) + out.heldBack.length;
    expect(placed).toBe(read.lines.length);

    // Six of the nine ticked lines are skis the shop already sells in 2027. The Mantra Junior's
    // only listing is the 2025 one — last season's, so its two lines are built new — and the
    // ninth is a Marker binding. One length is new to a ski the shop has in the others.
    expect(out.carryOver).toHaveLength(6);
    expect(out.fresh.map((f) => f.title)).toEqual(["Mantra Junior 2027", "Mantra Junior 2027 inc Marker Squire Binding Package"]);
    expect(out.freshSizes.map((f) => `${f.option} of ${f.handle}`)).toEqual(["158 of blaze-94-2027"]);
    // The five Griffons are the binding the men's packages are made with: package stock, not a
    // "Griffon 13 MN" listing of their own — and named as such rather than dropped. They are
    // Marker's, from the tab they are on, not Völkl's or the distributor's.
    expect(out.heldBack.map((h) => `${h.line.title} ${h.line.brand}: ${h.reason}`)).toEqual([
      "GRIFFON 13 MN; 100MM Marker: it is the binding the ski packages are made with, ordered to go on the skis, so it is not listed on its own",
    ]);
  });
});

describe("a new colourway of a listing the shop has", () => {
  const HEADER = "Handle,Title,Vendor,Type,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Inventory Qty,Variant Price,Variant Barcodes,Image Src,Image Position,Image Alt Text,Variant Image";
  const csv = [
    HEADER,
    `cartel-x-2026,Men's Cartel X Snowboard Bindings 2026,Burton,Snowboard Bindings,Colour,Black,Size,Medium,,2,449.99,9010000000001,https://img/black-1.jpg,1,,https://img/black-1.jpg`,
    `cartel-x-2026,,,,,Black,,Large,,1,449.99,9010000000002,https://img/black-2.jpg,2,,https://img/black-1.jpg`,
  ].join("\n");
  const line = (over: Partial<InvoiceLine>): InvoiceLine => ({ sku: "", barcode: "", title: "CARTEL X", costPrice: 269.99, rrp: null, quantity: 1, gender: "MENS", kind: "BINDINGS", ...over });
  const lines = [
    line({ barcode: "9010000000001", colour: "Black", size: "M" }),
    line({ barcode: "9010000000003", colour: "White", size: "M" }),
    line({ barcode: "9010000000004", colour: "White", size: "L" }),
  ];

  it("adds the colour as variants of the listing — never a count on another colour's row — spelled as the listing spells its sizes", () => {
    const out = buildDelivery(csv, lines, { vendor: "Burton", fields: { rrp: true, quantity: true, stock: "add" } });
    const grid = parseCsv(out.csv); const h = grid[0]; const at = (n: string) => h.indexOf(n);
    const rows = grid.slice(1).filter((r) => r[at("Handle")] === "cartel-x-2026").map((r) => [r[at("Option1 Value")], r[at("Option2 Value")], r[at("Variant Inventory Qty")]]);
    expect(rows).toEqual(expect.arrayContaining([["Black", "Medium", "3"], ["Black", "Large", "1"], ["White", "Medium", "1"], ["White", "Large", "1"]]));
    expect(out.fresh).toHaveLength(0);
    expect(out.freshSizes.map((x) => [x.option, x.newColour, x.line])).toEqual([["White / Medium", true, 1], ["White / Large", true, 2]]);
  });

  it("gives the new colour its own pictures from the page linked to it, after the listing's own", () => {
    const page = { sourceUrl: "https://example.com/cartel-x", description: "", features: [], images: ["https://img/white-1.jpg", "https://img/white-2.jpg"], confident: true, pageTitle: "Cartel X", via: "ai" as const, note: "" };
    const out = buildDelivery(csv, lines, { vendor: "Burton", fields: { rrp: true, quantity: true, stock: "add" }, pages: { 1: page } });
    const grid = parseCsv(out.csv); const h = grid[0]; const at = (n: string) => h.indexOf(n);
    const white = grid.slice(1).find((r) => r[at("Option1 Value")] === "White" && r[at("Option2 Value")] === "Medium")!;
    expect(white[at("Variant Image")]).toBe("https://img/white-1.jpg");
    const pictures = grid.slice(1).filter((r) => r[at("Handle")] === "cartel-x-2026" && /white-/.test(r[at("Image Src")])).map((r) => [r[at("Image Src")], r[at("Image Position")]]);
    expect(pictures).toEqual([["https://img/white-1.jpg", "3"], ["https://img/white-2.jpg", "4"]]);
  });
});

describe("what a delivery does to the products it touches", () => {
  const onSale = EXPORT.replace(",2027,TRUE,", ",\"2027, snow sale\",TRUE,");
  const arriving = [line({ barcode: "821264800133", title: "BLAZE 94", size: "170", quantity: 3, rrp: 1449.99 })];

  it("takes each one off the snow sale and into draft, to be looked at before it is live again", () => {
    const out = buildDelivery(onSale, arriving, { season: "2027", vendor: "Volkl" });
    expect(out.refused).toBeUndefined();
    const blaze = out.changes.filter((c) => c.handle === "blaze-94-2027");
    expect(blaze.find((c) => c.column === "Status")).toMatchObject({ before: "active", after: "draft" });
    expect(blaze.find((c) => c.column === "Tags")).toMatchObject({ before: "2027, snow sale", after: "2027" });
    // Once per product, on its first row, never on the 177's row.
    expect(blaze.filter((c) => c.column === "Status")).toHaveLength(1);
  });

  it("leaves the status alone when told the products stay live", () => {
    const out = buildDelivery(onSale, arriving, { season: "2027", vendor: "Volkl", fields: { draft: false } });
    expect(out.changes.map((c) => c.column)).not.toContain("Status");
    expect(out.changes.map((c) => c.column)).toContain("Tags");
  });

  it("keeps a product's rows together once a size is added to it", () => {
    // A new length is written on the end of the file and then moved up to sit with its ski, the
    // way Shopify reads a product: one block of rows under one handle.
    const twoSkis = EXPORT + "other-2027,Other 2027,<p>Another ski.</p>,Volkl,Snow Skis,2027,TRUE,Length,163,,'821264800999,999.99,999.99,1,Volkl Other 2027,active\r\n";
    const out = buildDelivery(twoSkis, [line({ barcode: "821264800157", title: "BLAZE 94", size: "184", quantity: 1, rrp: 1449.99 })], { season: "2027", vendor: "Volkl" });
    expect(out.refused).toBeUndefined();
    const rows = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    expect(rows.slice(1).map((r) => `${r[0]} ${r[8]}`)).toEqual(["blaze-94-2027 170", "blaze-94-2027 177", "blaze-94-2027 184", "other-2027 163"]);
  });
});

describe("a new product with a page for each colour", () => {
  const HEADER = "Handle,Title,Vendor,Type,Tags,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Inventory Qty,Variant Price,Variant Barcode,Image Src,Image Position,Image Alt Text,Variant Image";
  const csv = [HEADER, `other-2026,Other Thing 2026,Burton,Snow Jackets,2026,Colour,Black,Size,M,,1,199.99,9020000000001,,,,`].join("\n");
  const coat = (colour: string, size: string, barcode: string): InvoiceLine => ({ sku: "", barcode, title: "CYCLIC GORE-TEX 2L JACKET", costPrice: 300, rrp: 699.99, quantity: 1, gender: "MENS", kind: "JACKETS", colour, size });
  const lines = [coat("True Black", "M", "9030000000001"), coat("True Black", "L", "9030000000002"), coat("Jade", "M", "9030000000003")];
  const page = (colour: string) => ({ sourceUrl: `https://example.com/cyclic-${colour}`, description: `The Cyclic, in ${colour}.`, features: [], images: [`https://img/${colour}-1.jpg`, `https://img/${colour}-2.jpg`], confident: true, pageTitle: "Cyclic", via: "ai" as const, note: "" });

  it("lists each colour with its first line, for a link of its own", () => {
    const out = buildDelivery(csv, lines, { vendor: "Burton", fields: { rrp: true, quantity: true, stock: "add" } });
    expect(out.fresh[0].colours).toEqual([{ colour: "True Black", line: 0 }, { colour: "Jade", line: 2 }]);
  });

  it("gives every size of a colour that colour's first picture, and takes the words from the first colour's page", () => {
    const out = buildDelivery(csv, lines, { vendor: "Burton", fields: { rrp: true, quantity: true, stock: "add" }, colourPages: { 0: page("black"), 2: page("jade") } });
    const grid = parseCsv(out.csv); const h = grid[0]; const at = (n: string) => h.indexOf(n);
    const mine = grid.slice(1).filter((r) => r[at("Handle")] !== "other-2026");
    expect(mine.map((r) => r[at("Image Src")]).filter(Boolean)).toEqual(["https://img/black-1.jpg", "https://img/black-2.jpg", "https://img/jade-1.jpg", "https://img/jade-2.jpg"]);
    expect(mine.map((r) => r[at("Variant Image")]).filter(Boolean)).toEqual(["https://img/black-1.jpg", "https://img/black-1.jpg", "https://img/jade-1.jpg"]);
    expect(out.fresh[0].described).toBe(true);
    expect(out.fresh[0].title).toMatch(/^Men's Cyclic/);
  });
});
