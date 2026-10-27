/**
 * An order form laid out as size grids, with no item code to go by.
 *
 * A distributor's order workbook — one tab per brand — prices every model on a row and leaves a
 * box per size for the shop to write a quantity in. Nothing on the row is a code: the model is
 * known by its name, and the sizes are either written across the top ("75mm", "Size 110", "22.5")
 * or numbered ("Size 1" … "Size 6") with each model's own sizes in its name:
 *
 *   SATO (167, 173, 179, 185) NEW     … Size 1 ""  Size 2 "1"  Size 3 "1"
 *
 * is one Sato in 173 and one in 179. The grid is read by what is in it, as every other sheet is
 * (see columns.ts), not by any one brand's layout:
 *
 *  - a heading row is a row with sizes across it, or with a price heading (RRP, W/S) over the
 *    products below it; a row of sizes alone changes the sizes and keeps the prices' places;
 *  - a row of one word repeated, or one label and nothing else, names the kind of thing below it
 *    ("ALL TERRAIN SKIS", "POLES"), which is kept as the line's kind;
 *  - a product is a row with a name and a price;
 *  - a quantity is a small whole number in a size box.
 *
 * The name loses the sizes it lists, the "NEW" and "UNI" markers and a weight ("- 370 GR"), and a
 * colour written after it ("META black/orange", "CIRCA BEANIE - BLACK") goes in the colour, so the
 * product is called what it is (asked 2026-10-19).
 */

import { isColour } from "./columns";
import type { InvoiceLine } from "./reconcile";
import { brandIn } from "./brands";
import { colourName } from "./colour";
import { asShopWritesIt } from "./titles";
import type { InvoiceRead, PriceRow } from "./invoice";

const text = (v: unknown): string => (v ?? "").toString().replace(/\s+/g, " ").trim();
const norm = (v: string): string => v.toLowerCase().replace(/[\s._-]+/g, " ").trim();

/** A number as a form writes it: "1,349", "$642.38". */
function amount(raw: string): number | null {
  const v = raw.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

/** A quantity somebody wrote in a box: a small whole number. */
function quantityIn(raw: string): number | null {
  const n = amount(raw);
  return n !== null && Number.isInteger(n) && n > 0 && n <= 999 ? n : null;
}

/** A size written across the top of a grid. */
export function sizeHeading(raw: string): boolean {
  const v = raw.trim();
  return /^size\s*\d{1,3}(\s*\(.{1,6}\))?$/i.test(v)
    || /^\d{2,3}(\.\d)?\s*(mm|cm)?$/i.test(v)
    || /^uni(\s*\/\s*\d{2,3}\s*mm)?$/i.test(v)
    || /^\d{2,3}\s*cm$/i.test(v)
    || /^(xxs|xs|s|m|l|xl|xxl|s\/m|m\/l|l\/xl|o\/s|one size)$/i.test(v);
}

const RRP = /^(aud |unit )?rrp$|^retail|retail\b.*price|price.*retail|^retail\/pair$/;
const PREORDER = /^pre ?order$/;
const COST = /^w ?\/? ?s( pack)?$|^wholesale|wholesale\b|^indent|^dealer/;
const TOTAL = /^total( quantity| qty| units)?$/;
const QTY = /^(qty|quantity|quantity \(pairs\)|units)$/;
/** A word that says what kind of thing a section holds. */
const KIND_WORD = /\b(skis?|bindings?|boots?|poles?|skins?|packs?|backpacks?|bags?|helmets?|goggles?|eyewear|jackets?|pants|gloves?|accessor\w*|crampons?|spacers?|shims?|plates?|leash\w*|wax\w*|beanies?|caps?|hats?)\b/i;

/** The words a form heads its columns with, which name no section. */
const HEADING_WORD = /^(product code|item code|code|product|colou?r|release|weight|size|sizes|waist width|materials|last|mark up|lens|tech|total|qty|quantity|amount|total amount|total value|ex stock|aud rrp|rrp|unit rrp|w ?\/? ?s|w ?\/? ?s pack|pre ?order|indent|wholesale)\b/;
const NOT_A_PRODUCT = /^(total|grand total|general|minimum|preorders?|reorders?|freight|note|delivery|address|city|zip|post ?code|country|contact|tel|email|client|order due|requested)\b/i;

interface Layout {
  /** A ski's waist width, where the form gives it: it says what kind of ski it is. */
  waist?: number;
  sizes: Array<[number, string]>;
  /** Boxes with no size over them: a section headed without sizes keeps the grid's columns, each one quantity. */
  boxes: number[];
  rrp: number; cost: number; preorder: number; total: number; qty: number; size: number; colour: number; code: number;
  /** Further price columns: a second "RRP" over what is plainly the wholesale price, as one tab writes it. */
  others: number[];
}

/**
 * The model's own sizes, from its name: "OCTO (167, 173, 179, 185)" is 167 to 185. The first group
 * of numbers in brackets, which is where these forms write them.
 */
export function sizesInName(name: string): string[] {
  const m = /\(([^)]*\d[^)]*)\)/.exec(name);
  if (!m) return [];
  const parts = m[1].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  return parts.every((p) => /^\d{2,3}(\.\d)?$/.test(p)) ? parts : [];
}

/** What a size box stands for on this row: the Nth of the model's own sizes, or what the heading says. */
export function sizeFor(heading: string, name: string): string {
  const h = heading.trim();
  const ordinal = /^size\s*(\d)(?:\s*\((.{1,6})\))?$/i.exec(h);
  if (ordinal) {
    const listed = sizesInName(name);
    const n = Number(ordinal[1]);
    if (listed.length > 0) return listed[n - 1] ?? "";
    // "Size 1 (S)" over a product that lists no sizes of its own: the letter is the size.
    return ordinal[2]?.trim() ?? `Size ${n}`;
  }
  const labelled = /^size\s*(\d{2,3})$/i.exec(h);
  if (labelled) return labelled[1];
  const uni = /^uni(?:\s*\/\s*(\d{2,3}\s*mm))?$/i.exec(h);
  if (uni) return uni[1] ? uni[1].replace(/\s+/g, "") : "";
  return h.replace(/\s*(cm)$/i, "").replace(/\s+mm$/i, "mm");
}

/**
 * The model's name as the shop would call it: without the sizes it lists, its markers and its
 * weight, with the colour written after it taken off — and the colour, when there was one.
 */
export function cleanName(raw: string, colourColumn = ""): { title: string; colour: string; unisex: boolean } {
  let t = raw.replace(/\s+/g, " ").trim();
  const unisex = /\buni(sex)?\b/i.test(t);
  t = t.replace(/\s*\([^)]*\d[^)]*\)/g, " ");                       // (167, 173, 179, 185)
  t = t.replace(/\s*[-–]\s*\d+\s*gr?\.?$/i, "");                      // - 370 GR
  t = t.replace(/\s+\d{2,3}\s*-\s*\d{2,3}(\s*cm)?$/i, "");             // 110-140
  t = t.replace(/\b(new|uni|unisex)\b/gi, " ").replace(/\s+/g, " ").trim();
  let colour = colourColumn.trim();
  if (colour) {
    // "HY 13 FREE BLACK" beside a colour column of "black".
    const tail = new RegExp(`\\s*[-–]?\\s*${colour.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*")}$`, "i");
    if (tail.test(t) && t.replace(tail, "").trim()) t = t.replace(tail, "").trim();
  } else {
    const dash = /\s+[-–]\s+([^-–]+)$/.exec(t);
    if (dash && isColour(dash[1]) && !/\d/.test(dash[1])) {
      colour = dash[1].trim();
      t = t.slice(0, dash.index).trim();
    } else {
      // Colour words on the end: "META black/orange", "DORSA 22 olive green".
      const words = t.split(" ");
      const taken: string[] = [];
      while (words.length > 1) {
        const w = words[words.length - 1];
        if (!/\d/.test(w) && w.split("/").every((part) => part !== "" && isColour(part))) taken.unshift(words.pop()!);
        else break;
      }
      if (taken.length > 0) { colour = taken.join(" "); t = words.join(" "); }
    }
  }
  t = t.replace(/[\s,;:–-]+$/, "").trim();
  // A name half shouted — "PILUS pre cut CAMOX FREEBIRD", "pack of 3 CIRCA BEANIE" — is the
  // supplier's formatting, not a name somebody wrote: cased as the shop writes names.
  if (/\b[A-Z]{3,}\b/.test(t) && /\b[a-z]{2,}\b/.test(t)) t = asShopWritesIt(t.toUpperCase());
  return { title: t, colour: colour ? colourName(colour) : "", unisex };
}

/** A ski's section and waist as the words its categories are read from: "ALL TERRAIN SKIS, 88mm waist". */
function terrainOf(kind: string, waist: string): string {
  if (!/\bskis?\b/i.test(kind)) return "";
  const mm = /^\d{2,3}$/.test(waist.trim()) ? Number(waist) : null;
  return [kind, mm !== null && mm >= 60 && mm <= 150 ? `${mm}mm waist` : ""].filter(Boolean).join(", ");
}

/** A row that names the kind of thing below it: one label, repeated or alone, and no numbers. */
function sectionLabel(row: string[]): string {
  const filled = row.map(text).filter(Boolean);
  if (filled.length === 0) return "";
  if (new Set(filled.map((c) => c.toLowerCase())).size !== 1) return "";
  return /[a-z]/i.test(filled[0]) && !NOT_A_PRODUCT.test(filled[0]) ? filled[0] : "";
}

/** Read one tab as a size-grid order form. Null when nothing is written in any of its boxes. */
export function readGridForm(name: string, grid: string[][]): InvoiceRead | null {
  // The tab says whose goods these are; failing that, the form's own title rows ("ATK W25.26 BINDINGS").
  const brand = brandIn(name) || grid.slice(0, 15).map((r) => brandIn(sectionLabel((r ?? []).map(text)))).find(Boolean) || "";
  const lines: InvoiceLine[] = [];
  const priceList: PriceRow[] = [];
  const warnings: string[] = [];
  let layout: Layout | null = null;
  let kind = "";
  // What the whole tab is, from a title row above the first headings: "ATK W25.26 BINDINGS".
  let tabKind = "";

  for (let r = 0; r < grid.length; r++) {
    const cells = (grid[r] ?? []).map(text);
    const width = Math.max(cells.length, layout ? Math.max(layout.rrp, layout.cost, layout.preorder, layout.total, layout.qty, ...layout.sizes.map(([i]) => i)) + 1 : 0);
    const row = Array.from({ length: width }, (_, i) => cells[i] ?? "");
    const headings = row.map(norm);
    // A product row under the headings already read: a price where the prices are. Before the
    // heading tests, since a model's waist width ("87") reads like a size heading.
    const isProduct = layout !== null && [layout.rrp, layout.cost, layout.preorder].some((i) => i >= 0 && amount(row[i]) !== null);
    const sizes = row.map((c, i) => [i, c] as [number, string]).filter(([, c]) => sizeHeading(c));
    const priced = headings.some((h) => RRP.test(h) || COST.test(h) || PREORDER.test(h));
    const label = sectionLabel(row);
    // A heading row: sizes across it, or a price heading over the products below.
    if (!isProduct && (sizes.length >= 2 || (priced && !row.some((c) => amount(c) !== null && !sizeHeading(c))))) {
      const find = (re: RegExp) => headings.findIndex((h) => re.test(h));
      const prices: Omit<Layout, "sizes" | "boxes"> | null = priced
        ? { rrp: find(RRP), cost: find(COST), preorder: find(PREORDER), total: find(TOTAL), qty: find(QTY), size: find(/^size$/), colour: find(/^colou?r$/), code: find(/code/), others: headings.map((h, i) => (RRP.test(h) ? i : -1)).filter((i) => i >= 0).slice(1) }
        : layout ? { rrp: layout.rrp, cost: layout.cost, preorder: layout.preorder, total: layout.total, qty: layout.qty, size: layout.size, colour: layout.colour, code: layout.code, others: layout.others } : null;
      if (!prices) continue;
      const sized: Array<[number, string]> = sizes.length >= 1 && !(sizes.length === 1 && prices.qty >= 0) ? sizes.filter(([i]) => i !== prices.size) : [];
      const previous: number[] = layout ? (layout.sizes.length > 0 ? layout.sizes.map(([i]) => i) : layout.boxes) : [];
      const waistAt = headings.findIndex((h) => /^waist( width)?$/.test(h));
      const waistBefore: number | undefined = (layout as Layout | null)?.waist;
      layout = { ...prices, sizes: sized, boxes: sized.length > 0 ? [] : previous, ...(waistAt >= 0 ? { waist: waistAt } : waistBefore !== undefined ? { waist: waistBefore } : {}) };
      // A heading row often names the section too: "BIRDIE SKIS", or "ACCESSORIES | LEASES" beside "product code".
      const named = row.find((c) => /[a-z]{3,}/i.test(c) && !sizeHeading(c) && !HEADING_WORD.test(norm(c)));
      if (named) kind = named;
      continue;
    }
    if (label && !isProduct) { kind = label; if (!layout && !tabKind && KIND_WORD.test(label)) tabKind = label; continue; }
    if (!layout) continue;

    // The product's name: the first cell of words before the boxes.
    const firstBox = Math.min(...[...layout.sizes.map(([i]) => i), layout.rrp, layout.cost, layout.qty].filter((i) => i >= 0), row.length);
    const nameAt = row.findIndex((c, i) => i < firstBox && i !== layout!.colour && i !== layout!.code && /[a-z]{2,}/i.test(c));
    if (nameAt < 0) continue;
    const raw = row[nameAt];
    if (NOT_A_PRODUCT.test(raw)) continue;
    const rrp = layout.rrp >= 0 ? amount(row[layout.rrp]) : null;
    const preorder = layout.preorder >= 0 ? amount(row[layout.preorder]) : null;
    const wholesale = layout.cost >= 0 ? amount(row[layout.cost]) : null;
    // A second RRP heading over a lower figure is the wholesale price, mis-headed.
    const misheaded = layout.others.map((i) => amount(row[i])).find((n) => n !== null && n > 0 && rrp !== null && n < rrp) ?? null;
    const cost = preorder !== null && preorder > 0 ? preorder : wholesale !== null && wholesale > 0 ? wholesale : misheaded;
    if (rrp === null && cost === null) continue;

    const { title, colour, unisex } = cleanName(raw, layout.colour >= 0 ? row[layout.colour] : "");
    const sku = layout.code >= 0 && /\d/.test(row[layout.code]) && !/\s/.test(row[layout.code]) ? row[layout.code] : "";
    // A section that names no kind of thing — "RAIDER EVO FREETOURING" — is one of the tab's: bindings.
    const kindOf = tabKind && kind !== tabKind && !KIND_WORD.test(kind) && KIND_WORD.test(tabKind) ? `${tabKind} – ${kind}` : kind;
    const base: InvoiceLine = {
      sku,
      barcode: "",
      title,
      costPrice: cost,
      rrp: rrp !== null && rrp > 0 ? rrp : null,
      quantity: null,
      ...(brand ? { brand } : {}),
      ...(colour ? { colour } : {}),
      ...(unisex ? { gender: "Unisex" } : {}),
      ...(kindOf ? { kind: kindOf } : {}),
      // What the ski is for, as far as the form says: its section ("ALL TERRAIN SKIS", "BIG MOUNTAIN
      // SKIS") and its waist. The ski categories are worked out from it (disciplinesFromTerrain).
      ...(terrainOf(kindOf, layout.waist !== undefined ? row[layout.waist] : "") ? { terrain: terrainOf(kindOf, layout.waist !== undefined ? row[layout.waist] : "") } : {}),
    };
    priceList.push({ sku, title, colour, rrp: base.rrp, costPrice: cost });

    let ordered = 0;
    for (const [at, heading] of layout.sizes) {
      const quantity = quantityIn(row[at]);
      if (quantity === null) continue;
      const size = sizeFor(heading, raw);
      if (/^size \d$/i.test(size)) warnings.push(`${title}: "${heading}" has no size of its own in the name, so the line says "${size}" — check it.`);
      lines.push({ ...base, quantity, ...(size ? { size } : {}) });
      ordered += quantity;
    }
    if (layout.sizes.length === 0) {
      // No size boxes: one quantity, in the QTY column or in the grid's boxes under a heading without sizes.
      const boxes = layout.qty >= 0 ? [layout.qty] : layout.boxes;
      const quantity = boxes.map((i) => quantityIn(row[i]) ?? 0).reduce((a, b) => a + b, 0);
      const size = layout.size >= 0 ? row[layout.size] : "";
      if (quantity > 0) { lines.push({ ...base, quantity, ...(size ? { size } : {}) }); ordered = quantity; }
    }
    // The form's own total for the row, where it gives one, against what was read off it.
    const total = layout.total >= 0 ? quantityIn(row[layout.total]) : null;
    if (total !== null && ordered > 0 && total !== ordered) warnings.push(`${title}: the form's total says ${total}, the size boxes add up to ${ordered} — the boxes were used.`);
  }
  if (lines.length === 0) return null;
  return {
    lines,
    priceList,
    sheet: name,
    sizeGrid: lines.some((l) => l.size),
    shape: "grid",
    columns: { barcode: "", sku: "", rrp: "RRP", quantity: "the size boxes", title: "the product's name", size: "the size headings, or the sizes listed in the name", colour: "" },
    warnings,
  };
}
