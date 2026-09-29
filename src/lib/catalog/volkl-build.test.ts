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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";
import { applyMapping, suggestMapping } from "./mapping";
import { enrichFromSpecs } from "./pipeline";
import { keepOrderedLines, resolveAgainstReference } from "./reference-match";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
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
