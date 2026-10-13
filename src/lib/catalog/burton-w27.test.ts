/**
 * Burton's W27 "Confirmed and Cancel" sheet: the season's order as Burton confirmed it, with a
 * Demand, a Confirmed, an Unconfirmed and a Cancel column side by side, a delivery date per line
 * (October and November 2026, or April 2027), Burton and Anon on the one sheet, and no season
 * column at all — the season is in the file's name.
 *
 * The shop's instructions for it: only the lines due in 2026; a line whose EAN the shop already
 * has is that listing (a stock update, as a draft); anything else is built as a draft.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";
import { applyMapping, suggestMapping } from "./mapping";
import { keepOrderedLines, resolveAgainstReference } from "./reference-match";
import { dueInWindow, parseWindow } from "./deliveries";
import { listingByBarcode, listingsAsReference, listingsFromCsv } from "./shop-memory";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { siblingKey, siblingsOfPlaced } from "./siblings";
import type { CanonicalLineItem } from "./types";

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}8b3f8c87-Alpsport_W27_Burton_Confirmed_and_Cancel_FINAL_.xlsx`;
const SHOP = `${UP}59a4259d-products_export_1-2.csv`;

async function read() {
  const table = await extractXlsx(readFileSync(ORDER));
  const mapping = suggestMapping(table.headers, table.rows);
  const items = table.rows.map((row) => applyMapping(row, mapping));
  const { kept } = keepOrderedLines(items.map((item) => ({ item, fileId: "order" })));
  return { mapping, items, kept: kept.map((k) => k.item) };
}

describe.skipIf(!existsSync(ORDER))("Burton's W27 confirmation sheet", () => {
  it("reads what Burton confirmed as the quantity, and the delivery date and brand per line", async () => {
    const { mapping, items } = await read();
    expect(mapping["Confirmed Quantity MLL"]).toBe("quantity");
    expect(mapping["Demand Quantity MLL"]).toBe("");
    expect(mapping["Unconfirmed Quantity MLL"]).toBe("");
    expect(mapping["Cancel"]).toBe("cancelled");
    expect(mapping["Requested Delivery Date"]).toBe("deliveryDate");
    expect(mapping["Business Area Text"]).toBe("brand");
    expect(mapping["EAN"]).toBe("barcode");
    expect(items).toHaveLength(361);
    expect(items.every((i) => i.brand === "Burton" || i.brand === "Anon")).toBe(true);
    // Sheet row 4: demand 1, confirmed 1, unconfirmed 1 — what is coming is the 1 confirmed.
    expect(items[2]).toMatchObject({ title: "MERAK WAVECEL", size: "M", quantity: 1, deliveryDate: "2027-04-01" });
  }, 60_000);

  it("keeps only the lines with something coming, and of those only the ones due in 2026", async () => {
    const { kept } = await read();
    expect(kept).toHaveLength(318);
    const window = parseWindow("2026")!;
    const due = kept.filter((i) => (dueInWindow(i, window).quantity ?? 0) > 0);
    expect(due).toHaveLength(165);
    expect(due.every((i) => (i.deliveryDate ?? "").startsWith("2026-"))).toBe(true);
    expect(kept.filter((i) => (i.deliveryDate ?? "").startsWith("2027-")).every((i) => dueInWindow(i, window).quantity === 0)).toBe(true);
  }, 60_000);

  it.skipIf(!existsSync(SHOP))("places a line on the shop's listing by its EAN before any name is compared", async () => {
    const listings = listingsFromCsv(readFileSync(SHOP, "utf8"));
    expect(listings.some((l) => (l.barcodes ?? []).length > 0)).toBe(true);
    const owner = listingByBarcode(listings);
    const { kept } = await read();
    const hits = kept.map((line, k) => [k, owner.get(line.barcode)] as const).filter((x): x is readonly [number, NonNullable<ReturnType<typeof owner.get>>] => Boolean(x[1]));
    // Carry-overs: the shop already has some of these EANs.
    expect(hits.length).toBeGreaterThan(0);
    const refs = ["Burton", "Anon"].flatMap((b) => listingsAsReference(listings, b));
    const byHandle = new Map(refs.map((r) => [r.modelCode, r]));
    const decided = new Map<number, CanonicalLineItem>();
    for (const [k, l] of hits) { const ref = byHandle.get(l.handle); if (ref) decided.set(k, ref); }
    expect(decided.size).toBeGreaterThan(0);
    const resolved = resolveAgainstReference(kept, refs, DEFAULT_CATEGORY_RULES, decided, () => "", true);
    for (const [k] of decided) {
      const join = resolved.joined[k];
      expect("to" in join ? join.to : join).toBe(decided.get(k)!.title);
    }
  }, 60_000);

  it.skipIf(!existsSync(SHOP))("places a new colourway beside the colourways of its model the shop already has", async () => {
    const listings = listingsFromCsv(readFileSync(SHOP, "utf8"));
    const owner = listingByBarcode(listings);
    const { kept } = await read();
    const placed = new Map<number, string>();
    kept.forEach((line, k) => { const l = owner.get(line.barcode); if (l) placed.set(k, l.handle); });
    const more = siblingsOfPlaced(kept, placed);
    expect(more.size).toBeGreaterThan(0);
    for (const [k, handle] of more) {
      // Nothing placed twice, and every placed line is a sibling (same supplier name, same audience)
      // of a line the shop has by EAN on that very listing.
      expect(placed.has(k)).toBe(false);
      const siblings = [...placed].filter(([j]) => siblingKey(kept[j]) === siblingKey(kept[k]));
      expect(siblings.length).toBeGreaterThan(0);
      expect(siblings.every(([, h]) => h === handle)).toBe(true);
    }
    // "M CARTEL X" in a new colour has no EAN in the shop, its other colours do: it is the same
    // listing, not a second "Cartel X" product.
    const cartel = kept.map((l, k) => k).filter((k) => /^CARTEL X$/i.test(kept[k].title));
    const known = cartel.filter((k) => placed.has(k));
    const fresh = cartel.filter((k) => !placed.has(k));
    expect(known.length).toBeGreaterThan(0);
    expect(fresh.length).toBeGreaterThan(0);
    for (const k of fresh) expect(more.get(k)).toBe(placed.get(known[0]));
  }, 60_000);
});
