/**
 * Building the Volkl delivery from the three files the shop actually receives.
 *
 * An order form, a spec export and a barcode list, all real, and none of them useful alone. What
 * makes them one product is that they share two keys: the supplier's item code, and that code
 * with the length on the end — "V2610112.000.170" — which is how the spec export spells its "SKU
 * no. // LENGTH" column and what the barcode sits against.
 *
 * Every number below was read off those files, and all three failures this fixes were reported
 * from the shop floor: no barcodes, no specs, and the whole 375-model price list arriving as
 * stock instead of the nine skis that were bought.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";
import { applyMapping, suggestMapping } from "./mapping";
import { enrichFromSpecs } from "./pipeline";
import { keepOrderedLines, resolveAgainstReference } from "./reference-match";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { parseCsv } from "./csv";
import type { CanonicalLineItem } from "./types";

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}206de565-Volkl_DECEMBER_RETAIL__2026_order_.xlsx`;
const SPECS = `${UP}c5feed7c-20260202_PIM_Export_VolklSkis_2627.xlsx`;
const BARCODES = `${UP}f979282e-Marker_Volkl_New_Barcodes_2627.xlsx`;

async function read(path: string): Promise<CanonicalLineItem[]> {
  const table = await extractXlsx(readFileSync(path));
  const mapping = suggestMapping(table.headers);
  return table.rows.map((row) => applyMapping(row, mapping));
}

interface Built {
  title: string; brand: string; description: string; tags: string[]; imageUrls: string[];
  metafields: Record<string, string>; variants: Array<{ item: CanonicalLineItem }>;
}

async function build(): Promise<Built[]> {
  const [order, specs, barcodes] = await Promise.all([read(ORDER), read(SPECS), read(BARCODES)]);
  const byCode = new Map<string, Built>();
  for (const item of order) {
    const key = item.modelCode || item.title;
    if (!byCode.has(key)) byCode.set(key, { title: item.title, brand: "Volkl", description: "", tags: [], imageUrls: [], metafields: {}, variants: [] });
    byCode.get(key)!.variants.push({ item });
  }
  return enrichFromSpecs([...byCode.values()], [...specs, ...barcodes]);
}

describe("the Volkl December delivery", () => {
  it("builds what was ordered, not the price list it was ordered from", { timeout: 60_000 }, async () => {
    const products = await build();
    expect(products.map((p) => p.title)).toEqual([
      "M7 MANTRA", "MANTRA 88 W", "BLAZE 94 BLACK FLAT", "BLAZE 94 ROSE FLAT",
      "REVOLT 101 FLAT", "MANTRA JUNIOR", "GRIFFON 13 MN; 100MM",
    ]);
    const mantra = products[0];
    expect(mantra.variants.map((v) => v.item.length)).toEqual(["170", "177"]);
    expect(mantra.variants.map((v) => v.item.quantity)).toEqual([1, 2]);
    expect(mantra.variants.every((v) => v.item.rrp === 1649)).toBe(true);
  });

  it("puts each length's barcode on that length", { timeout: 60_000 }, async () => {
    const products = await build();
    const skis = products.filter((p) => p.title !== "GRIFFON 13 MN; 100MM");
    expect(skis.flatMap((p) => p.variants).every((v) => /^\d{12,13}$/.test(v.item.barcode))).toBe(true);
    expect(products[0].variants.map((v) => v.item.barcode)).toEqual(["821264838167", "821264838105"]);
    // The binding has no length, so it joins on its item code alone, off the other sheet.
    expect(products[6].variants[0].item.barcode).toBe("883295504657");
  });

  it("carries the specs the supplier published, in the shop's own body format", { timeout: 60_000 }, async () => {
    const products = await build();
    const body = products[0].description;
    expect(body.startsWith("<h2>Tech Specs</h2>")).toBe(true);
    // The lengths are the ones bought, written as the shop writes them, not the spec row's.
    expect(body).toContain("<li>LENGTH: 170, 177</li>");
    expect(body).toContain("<li>WAIST WIDTH: 96 mm</li>");
    expect(body).toContain("TIP WIDTH:");
    // And the supplier's paperwork stays off the page.
    expect(body).not.toMatch(/customs|fedas|hts/i);
  });

  it("does not read one model's specs onto another with a longer name", { timeout: 60_000 }, async () => {
    // The Mantra 88 W took the Mantra 88's waist width, ability and gender, because one title
    // contains the other. A spec row that carries an item code is now matched on that alone.
    const products = await build();
    const womens = products.find((p) => p.title === "MANTRA 88 W")!;
    expect(womens.metafields.gender).toBe("Ladies");
    expect(womens.metafields.waist_width).toBe("88 mm");
    expect(products.find((p) => p.title === "MANTRA JUNIOR")!.metafields.gender).toBe("Junior");
  });
});

describe("the Volkl order joined to its reference sheets", () => {
  async function join() {
    const [order, specs, barcodes] = await Promise.all([ORDER, SPECS, BARCODES].map(async (path) => {
      const table = await extractXlsx(readFileSync(path));
      const mapping = suggestMapping(table.headers, table.rows);
      return table.rows.map((row) => applyMapping(row, mapping));
    }));
    const { kept } = keepOrderedLines(order.map((item) => ({ item, fileId: "order" })));
    const source = new Map<CanonicalLineItem, string>([...specs.map((s) => [s, "pim"] as const), ...barcodes.map((s) => [s, "barcodes"] as const)]);
    return resolveAgainstReference(kept.map((k) => k.item), [...specs, ...barcodes], DEFAULT_CATEGORY_RULES, new Map(), (s) => source.get(s) ?? "");
  }

  it("joins every line, and names each ski the way the shop does", { timeout: 60_000 }, async () => {
    const { items, joined } = await join();
    expect(joined.filter((j) => "to" in j)).toHaveLength(joined.length);
    const skis = items.filter((i) => i.productType === "Skis");
    const shown = skis.map((i) => `${i.title}|${i.colour}|${i.length}|${i.season}`);
    // "BLAZE 94 BLACK FLAT" is the flat (no binding) Blaze 94 in black: the shop's "Blaze 94 2027",
    // Colour Black. Not "Blaze 94 Black" in a colour called "Flat".
    expect(shown).toContain("BLAZE 94|Black|179|2027");
    expect(shown).toContain("BLAZE 94|Rose|158|2027");
    expect(shown).toContain("REVOLT 101||182|2027");
    // "Junior" is part of the model's name ("Mantra Junior 2025" in the shop), not its colour.
    expect(shown).toContain("MANTRA JUNIOR||138|2027");
    const blaze = items.filter((i) => i.title === "BLAZE 94");
    expect(new Set(blaze.map((i) => i.modelCode)).size).toBe(1);
  });
});

/**
 * The Völkl order as the shop sells skis: flat, and as a package with a binding.
 *
 * Checked against the shop's own export (22065406): the M7 Mantra 2027 is 1649.99 flat and 2108.99
 * with a Griffon (+459), 2163.99 mounted (+55), costing 749.55 and 958.19 (+208.64, the Griffon's
 * INDENT price); the Mantra 88 W is 1449.99 flat and 1798.99 with a Squire (+349).
 */
describe.skipIf(!existsSync(`${UP}22065406-products_export_1-7.csv`))("the Volkl order, flat and packaged", () => {
  async function deliver() {
    const { sheetGrids } = await import("./extract/tabular");
    const { readInvoiceGrids } = await import("./invoice");
    const { buildDelivery } = await import("./delivery");
    const { listingsFromCsv } = await import("./shop-memory");
    const invoice = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)))!;
    const [specs, barcodes] = await Promise.all([SPECS, BARCODES].map(async (p) => {
      const t = await extractXlsx(readFileSync(p));
      const m = suggestMapping(t.headers, t.rows);
      return t.rows.map((r) => applyMapping(r, m));
    }));
    const csv = readFileSync(`${UP}22065406-products_export_1-7.csv`, "utf8");
    const memory = listingsFromCsv(readFileSync(`${UP}48bf1557-products_export_1_5.csv`, "utf8"));
    return { invoice, csv, out: buildDelivery(csv, invoice.lines, { season: "2027", vendor: "Volkl", specs: [...specs, ...barcodes], listings: memory, priceList: invoice.priceList }) };
  }

  it("reads the bindings' prices and costs off the Marker tab", { timeout: 60_000 }, async () => {
    const { invoice } = await deliver();
    const { bindingFrom, DEFAULT_PACKAGE_BINDINGS } = await import("./packages");
    expect(bindingFrom(DEFAULT_PACKAGE_BINDINGS.mens, invoice.priceList!)).toMatchObject({ label: "Marker Griffon - Black", rrp: 459 });
    expect(bindingFrom(DEFAULT_PACKAGE_BINDINGS.womens, invoice.priceList!)).toMatchObject({ label: "Marker Squire - White", rrp: 349 });
    // INDENT, which is what the shop's costs are: the M7 Mantra at 749.55.
    expect(invoice.lines.find((l) => l.title === "M7 MANTRA")?.costPrice).toBeCloseTo(749.55, 2);
  });

  it("counts the skis onto their packages too, matched by the barcode the two share", { timeout: 60_000 }, async () => {
    const { out } = await deliver();
    expect(out.heldBack).toEqual([]);
    const qty = out.changes.filter((c) => c.column === "Variant Inventory Qty").map((c) => `${c.handle} ${c.before}->${c.after}`);
    expect(qty).toEqual(expect.arrayContaining([
      "m7-mantra 3->5",
      "m7-mantra-2027-inc-marker-griffon-binding-package 3->5",
      "mantra-88-w-2027 0->1",
      "mantra-88-w-2027-inc-marker-squire-binding-package 0->1",
    ]));
    // No Compare At cut from 1649.99 to 1649.
    expect(out.changes.filter((c) => c.column === "Variant Compare At Price")).toEqual([]);
  });

  it("adds a new length to the package as well as the ski, with the ski's barcode", { timeout: 60_000 }, async () => {
    const { out, csv } = await deliver();
    const rows = parseCsv(out.csv).filter((r) => r.some((c) => c.trim()));
    const h = rows[0];
    const added = rows.slice(parseCsv(csv).filter((r) => r.some((c) => c.trim())).length);
    const pack158 = added.filter((r) => r[h.indexOf("Handle")] === "blaze-94-2027-inc-marker-griffon-binding-package");
    expect(pack158).toHaveLength(6);   // 3 bindings the package offers × 2 fittings
    expect(new Set(pack158.map((r) => r[h.indexOf("Option1 Value")]))).toEqual(new Set(["158"]));
    expect(new Set(pack158.map((r) => r[h.indexOf("Variant Barcodes")]))).toEqual(new Set(["821264839478"]));
  });

  it("builds a new ski's package from the binding the shop chose for it last season", { timeout: 60_000 }, async () => {
    const { out } = await deliver();
    const pack = out.fresh.find((f) => f.handle === "mantra-junior-2027-inc-marker-squire-binding-package")!;
    expect(pack.title).toBe("Mantra Junior 2027 inc Marker Squire Binding Package");
    expect(pack.tags).toContain("ski packages");
    expect(pack.variants.map((v) => `${v.option} ${v.price}`)).toEqual([
      "138 / Marker Squire - Black / Do Not Mount My Bindings 948.99",
      "138 / Marker Squire - Black / Please Mount My Bindings 1003.99",
      "148 / Marker Squire - Black / Do Not Mount My Bindings 948.99",
      "148 / Marker Squire - Black / Please Mount My Bindings 1003.99",
    ]);
    expect(pack.variants.every((v) => v.barcode.startsWith("82126484"))).toBe(true);
  });
});
