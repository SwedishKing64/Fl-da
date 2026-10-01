/**
 * Burton's W26 "RDD or Cancel" sheet: the season's whole order as an SAP demand export, 402 lines
 * with a Cancel column against the ones that will not ship, built on its own.
 *
 * Reported from the shop floor: it built ONE product. Every column is headed the SAP way — Payer
 * Name, Business Area Text, Selling Season ITM, PH2 Description, Size Z Description — and the
 * reader took "Payer Name" (Alpsport, on every line) as the product. What it should read is what
 * a person reads off it: W is the model, X the colour, Z the size, AA the barcode, M the vendor,
 * AH the quantity and AE the cost.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";
import { applyMapping, suggestMapping } from "./mapping";
import { keepOrderedLines, resolveAgainstReference } from "./reference-match";
import { groupLineItems } from "./grouping";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { listingsAsReference, listingsFromCsv } from "./shop-memory";
import { productTitle, seasonTagFrom } from "./titles";

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}968772e5-Alpsport_Burton_W26_RDD_or_Cancel_sent_14.5.25__.xlsx`;
const SHOP = `${UP}59a4259d-products_export_1-2.csv`;

async function build() {
  const table = await extractXlsx(readFileSync(ORDER));
  const mapping = suggestMapping(table.headers, table.rows);
  const items = table.rows.map((row) => applyMapping(row, mapping));
  const { kept, notOrdered } = keepOrderedLines(items.map((item) => ({ item, fileId: "order" })));
  const lines = kept.map((k) => k.item);
  const listings = existsSync(SHOP) ? listingsFromCsv(readFileSync(SHOP, "utf8")) : [];
  const refs = ["Burton", "Anon"].flatMap((b) => listingsAsReference(listings, b));
  // As the pipeline does it: strictly, and a joined line is named exactly as the shop lists it.
  const resolved = resolveAgainstReference(lines, refs, DEFAULT_CATEGORY_RULES, new Map(), () => "", true);
  resolved.items.forEach((item, k) => {
    const join = resolved.joined[k];
    const listing = "to" in join ? refs.find((r) => r.title === join.to) : undefined;
    resolved.items[k] = { ...item, modelCode: lines[k].modelCode, ...(listing ? { title: listing.title, productType: listing.productType || item.productType, rrp: item.rrp ?? listing.rrp } : {}) };
  });
  const products = groupLineItems(resolved.items, DEFAULT_CATEGORY_RULES, { listings })
    .map((g) => ({ ...g, fullTitle: productTitle(g.title, seasonTagFrom(g.tags)) }));
  return { mapping, items, kept: lines, notOrdered, resolved, products };
}

describe.skipIf(!existsSync(ORDER))("Burton's W26 RDD-or-Cancel sheet", () => {
  it("reads the columns for what they are, not what SAP heads them", async () => {
    const { mapping } = await build();
    expect(mapping["Style Description"]).toBe("title");
    expect(mapping["Payer Name"]).toBe("");                // who is paying, not what was bought
    expect(mapping["Customer Name"]).toBe("");
    expect(mapping["Business Area Text"]).toBe("brand");  // Anon, Burton
    expect(mapping["Selling Season ITM"]).toBe("season"); // 26WIN
    expect(mapping["Collection"]).not.toBe("season");     // NOC on every line
    expect(mapping["Gender Description"]).toBe("gender");
    expect(mapping["PH2 Description"]).toBe("category");  // GOGGLES, HELMETS, BOOTS...
    expect(mapping["Size Z Description"]).toBe("width");  // Regular, Wide, Low Bridge
    expect(mapping["Size Description"]).toBe("size");
    expect(mapping["Color Description"]).toBe("colour");
    expect(mapping["EAN"]).toBe("barcode");
    expect(mapping["SKU Number"]).toBe("sku");
    expect(mapping["Wholesale Price p.u."]).toBe("costPrice");
    expect(mapping["Demand Quantity MLL"]).toBe("quantity");
    expect(mapping["Cancel"]).toBe("cancelled");
  }, 60_000);

  it("keeps what is coming: the quantity less what was cancelled", async () => {
    const { items, kept, notOrdered } = await build();
    expect(items).toHaveLength(402);
    expect(kept).toHaveLength(291);
    expect(notOrdered).toBe(111);
    // Row 5: M4 Toric, one ordered, one cancelled — not coming.
    expect(kept.some((i) => i.sku === "2035519Z53RG0NA")).toBe(false);
    // Row 23: Sync, two ordered, two cancelled.
    expect(kept.some((i) => i.sku === "2150616Z53LB0NA")).toBe(false);
    expect(kept.every((i) => (i.quantity ?? 0) > 0)).toBe(true);
    expect(kept.every((i) => i.season === "2026")).toBe(true);
    expect(kept.every((i) => i.brand === "Anon" || i.brand === "Burton")).toBe(true);
    expect(kept.every((i) => /^\d{13}$/.test(i.barcode))).toBe(true);
    expect(kept.every((i) => i.costPrice !== null)).toBe(true);
    // "NA" under Size is no size at all.
    expect(kept.filter((i) => i.brand === "Anon" && /goggle/i.test(i.category)).every((i) => i.size === "")).toBe(true);
  }, 60_000);

  it("builds one product per model, per fit, per audience, with the same SKU's lines folded", async () => {
    const { products } = await build();
    const titled = (t: string) => products.filter((p) => p.fullTitle === t);
    // The M4 Cylindrical is on the first three lines and again on the April order: one product
    // in regular fit, one in low bridge (the shop lists fits as their own products).
    const m4 = titled("M4 Cylindrical 2026");
    expect(m4).toHaveLength(1);
    expect(m4[0].brand).toBe("Anon");
    expect(m4[0].productType).toBe("Goggles");
    expect(m4[0].variants.map((v) => v.item.sku).sort()).toEqual(["2035417Z53RG0NA", "2035417Z58RG0NA"]);
    // Black/Prcv Vrbl Blue regular: 2 in the December delivery and 1 in April, one variant of 3.
    expect(m4[0].variants.find((v) => v.item.sku === "2035417Z53RG0NA")?.item.quantity).toBe(3);
    expect(titled("M4 Cylindrical Low Bridge 2026")).toHaveLength(1);
    // Snowboard boots and bindings, not ski boots and bindings, and a wide boot is its own product.
    expect(products.filter((p) => /\bBOA\b|Highshot|Photon|Limelight/i.test(p.title)).every((p) => p.productType === "Snowboard Boots")).toBe(true);
    expect(products.filter((p) => /Cartel|Genesis|Mission|Lexa|Citizen|Escapade/i.test(p.title)).every((p) => p.productType === "Snowboard Bindings")).toBe(true);
    expect(products.some((p) => /Photon BOA Wide/i.test(p.fullTitle) || /Photon BOA® Wide/i.test(p.fullTitle))).toBe(true);
    // Men's and women's are two products, as the shop lists them.
    const deluxe = products.filter((p) => /Deluxe/i.test(p.title) && /Gloves|GL\b/i.test(p.title));
    expect(deluxe.length).toBeGreaterThanOrEqual(2);
    expect(new Set(deluxe.map((p) => p.tags.find((t) => t === "mens" || t === "womens"))).size).toBe(2);
    // Nothing goes out with the supplier's shorthand as its Type.
    expect(products.every((p) => !/^(FREERIDE|TRACTION|NECKWEAR|IMPACT PROTECTION|EQUIPMENT BAGS)$/i.test(p.productType))).toBe(true);
    expect(products.every((p) => p.tags.includes("2026"))).toBe(true);
  }, 60_000);

  it.skipIf(!existsSync(SHOP))("names a carry-over as the shop lists it", async () => {
    const { resolved, products } = await build();
    const joined = resolved.joined.filter((j) => "to" in j);
    expect(joined.length).toBeGreaterThan(0);
    // "PHOTON STEP ON" in Wide, men's, is the shop's "Men's Photon Step On® Wide Snowboard Boots",
    // at the shop's price, and the regular Ruler BOA line is NOT the shop's wide one.
    const photon = products.find((p) => /^Men's Photon Step On® Wide Snowboard Boots/i.test(p.title));
    expect(photon).toBeDefined();
    expect(photon!.variants.every((v) => v.item.rrp === 699.99)).toBe(true);
    expect(photon!.productType).toBe("Snowboard Boots");
    // A bag the shop lists twice, once years ago as "Wheelie Gig Bag", lands on the current listing.
    expect(products.some((p) => p.title === "Wheelie Gig Snowboard Bag")).toBe(true);
    expect(products.some((p) => p.title === "Wheelie Gig Bag")).toBe(false);
    // "HIGHSHOT XPRO SO" is not the Highshot: a word left over refuses the listing.
    expect(products.filter((p) => /^Men's Highshot Step On® Snowboard Boots$/.test(p.title))).toHaveLength(0);
  }, 60_000);
});
