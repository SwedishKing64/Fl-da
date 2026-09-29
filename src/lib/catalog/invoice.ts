/**
 * Reading a supplier's invoice or order form well enough to match it to the shop.
 *
 * Deliberately narrow. The importer reads a supplier document for everything it can — brand,
 * specs, colourways, descriptions — because it is building listings from nothing. This is the
 * other case: the products already exist, so the only things worth reading are the ones that
 * identify a line and the numbers that change on it. Five columns out of forty.
 *
 * It is done by looking at the columns rather than by asking the model, for the same reason the
 * sale sheet is: it costs nothing, it is instant, it works with no API key, and it cannot read the
 * same file two different ways on two different days. A document that is not a table — a PDF
 * invoice, a photograph of one — still goes to the model, from the action that calls this.
 *
 * Every column is chosen by its heading AND confirmed by what is under it. Their own files are why:
 * the Volkl PIM export has a column headed "rental barcode" whose every value is the words "not
 * included", and it sits eight columns before the real one, headed "GTIN". A heading alone would
 * have picked the wrong one and matched nothing, which at least fails loudly — but a heading alone
 * would also read "W/S" and "INDENT", the wholesale and indent cost on their Marker order form, as
 * prices to put in front of customers.
 */

import { detectHeaderRow } from "./extract/tabular";
import { normaliseBarcode, type InvoiceLine } from "./reconcile";
import { terrainColumn } from "./shop-memory";
import { brandIn } from "./brands";

export interface InvoiceRead {
  lines: InvoiceLine[];
  /** The sheet it was read from, and the heading it used for each thing, to show on screen. */
  sheet: string;
  columns: { barcode: string; sku: string; rrp: string; quantity: string; title: string; size: string; colour: string };
  warnings: string[];
  /**
   * Every priced row on the form, ordered or not — the supplier's price list. A package is priced
   * from a binding nobody ordered on its own: the Griffon the M7 Mantra is sold with is a row of
   * the Marker tab with no quantity against it.
   */
  priceList?: PriceRow[];
  /**
   * "grid" when the quantities were read off a size grid — a column per length, a number in the
   * box — which has no row-per-line table of its own; "flat" when each line is a row.
   */
  shape?: "grid" | "flat";
}

/** One row of a supplier's price list. */
export interface PriceRow { sku: string; title: string; colour: string; rrp: number | null; costPrice: number | null }

const text = (value: unknown): string => (value ?? "").toString().trim();
const norm = (value: string): string => value.toLowerCase().replace(/[\s._/-]+/g, " ").trim();

/** A number as a supplier writes one: $1,099.00, 1 099,00 rejected, blank is null. */
export function readNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$€£\s]/g, "").replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

interface Column { index: number; heading: string }

/**
 * Pick the column for one thing: heading first, then proof from the values under it.
 *
 * `hint` says which headings are worth trying and `veto` which are never right whatever they look
 * like. `proves` is the test a column's values have to pass, on more than half of the ones that
 * are filled in — enough to rule out a heading that means something else, without demanding a
 * document be perfect.
 */
function pick(
  headings: string[],
  rows: string[][],
  hint: RegExp,
  veto: RegExp | null,
  proves: (value: string) => boolean,
  fallbackScan = false,
): Column | null {
  const share = (i: number): number => {
    const values = rows.map((r) => text(r[i])).filter(Boolean);
    if (values.length === 0) return 0;
    return values.filter(proves).length / values.length;
  };
  const candidates = headings
    .map((h, index) => ({ index, heading: h }))
    .filter((c) => hint.test(norm(c.heading)) && !(veto && veto.test(norm(c.heading))));
  // A column in another currency only when there is nothing else. Burton's form has AUD-RETAIL and
  // NZD-RETAIL side by side, both full of prices; the shop sells in Australian dollars.
  const foreign = (heading: string) => FOREIGN.test(norm(heading)) ? 1 : 0;
  const best = candidates.map((c) => ({ ...c, score: share(c.index) })).filter((c) => c.score > 0.5)
    .sort((a, b) => foreign(a.heading) - foreign(b.heading) || b.score - a.score)[0];
  if (best) return { index: best.index, heading: best.heading };
  if (!fallbackScan) return null;
  // Nothing was headed usefully. A column can still be unmistakable by its contents — a whole
  // column of thirteen-digit numbers is a barcode column whatever it is called, or not called.
  const scanned = headings.map((_, index) => ({ index, score: share(index) })).filter((c) => c.score > 0.9).sort((a, b) => b.score - a.score)[0];
  return scanned ? { index: scanned.index, heading: headings[scanned.index] || `Column ${scanned.index + 1}` } : null;
}

const BARCODE = /\bean\b|\bgtin\b|barcode|\bupc\b/;
const NOT_BARCODE = /rental|internal/;
const SKU = /\bsku\b|item no|item code|item number|article no|article code|supplier code|style no|style code|product code|model code|\bcode\b/;
const RRP = /\brrp\b|recommended|retail|\bmsrp\b|\bsrp\b/;
const NOT_RRP = /\bw s\b|wholesale|cost|indent|total|margin|gst/;
const QTY = /^qty|quantity|units|ordered|order qty/;
// What the shop pays. "AUD-WHSL" on Burton's form; "W/S" on the Marker one.
const COST = /whsl|wholesale|\bw s\b|\bcost\b|\bdealer\b|\bnet price\b|\bbuy price\b/;
const NOT_COST = /total|margin|retail|\brrp\b|gst|incl/;
const FOREIGN = /\b(nzd|usd|eur|gbp|chf|cad|jpy|sek|nok)\b/;
const GENDER = /^gender$|^sex$|^men women$|^suitable for$/;
// Their order forms head it "Sizes", "size (ski length)" or "Size". Not "sizes" as a LIST of the
// lengths a ski comes in, which is a different column with the same name — that is why the values
// have to look like one size rather than five.
const SIZE = /^size|^sizes$|length|mondo/;
const COLOUR = /colou?r|^options?$/;
const TITLE = /descri|product|title|\bname\b|model|style/;

/**
 * A supplier's ORDER FORM, where the order is the cells somebody filled in.
 *
 * This is the shape that was being read wrong, and read wrong in the worst direction. Their Volkl
 * December workbook is a price list of the entire range — 375 models — laid out as a size grid:
 *
 *     RACETIGER | Item No.      | RACETIGER        | Sizes  | RRP  | TOTAL QTY | 148 | 150 | 153 …
 *     Flat      | V2610001.000  | RACETIGER GS MAS | 168/…  | 2249 |           |     |     |
 *     …
 *     System    | V2610112.000  | M7 MANTRA        | …      | 1649 |           |     |  1  |
 *
 * Every row is a product the supplier sells; only the rows with a number under a length are
 * products the shop BOUGHT. Reading every row as an order line turned a nine-line order into 375,
 * which is not a near miss — it is the whole catalogue presented as this month's delivery.
 *
 * Three things about the layout have to be honoured or the wrong cells are read:
 *
 *  - The sheet has a header PER SECTION, not one at the top, and each section has its own lengths.
 *    Racetigers run 148-183 and Peregrines 151-182, so the column that means "170" in one section
 *    means something else twelve rows down.
 *  - A filled cell is a line of its own. "M7 Mantra, 170: 1, 177: 2" is two lines, one per length,
 *    which is exactly what the reconciler wants: a length identifies the variant.
 *  - A row with no item code is not an order however many numbers are on it. Their Race Ski tab
 *    has a bare "ADUILT RACE" row of lengths that reads as fourteen quantities otherwise, and
 *    their footers put the indent discount and the GST under the QTY heading.
 */
const ITEM_HEADING = /^(item|article|style|product)\s*(no\.?|number|code)$/;

/** A quantity somebody wrote in a box: a small whole number, not a price, a rate or a length. */
function orderedQuantity(raw: string): number | null {
  const value = readNumber(raw);
  if (value === null || !Number.isInteger(value) || value <= 0 || value > 999) return null;
  return value;
}

/**
 * An item code, as against a sentence that happens to be in the item-code column.
 *
 * Theirs are V2610112.000, 7522A1.BB, 2020Y1.SS — short, no spaces, starting on a letter or a
 * digit. A footnote is none of those things.
 */
function looksLikeItemCode(value: string): boolean {
  return value.length >= 3 && value.length <= 40 && (value.match(/\s/g) ?? []).length <= 1 && /^[A-Za-z0-9]/.test(value);
}

interface Section { at: number; end: number; sku: number; title: number; rrp: number; cost: number; colour: number; qty: number; sizes: Array<[number, string]> }

function sectionsOf(grid: string[][]): Section[] {
  const heads: number[] = [];
  grid.forEach((row, i) => {
    if ((row ?? []).some((c) => ITEM_HEADING.test(norm(text(c))))) heads.push(i);
  });
  return heads.map((at, n) => {
    const headings = (grid[at] ?? []).map(text);
    const find = (re: RegExp) => headings.findIndex((c) => re.test(norm(c)));
    const qty = find(/^(total )?qty$|^quantity$/);
    // The lengths and sizes: numeric headings, and only past the quantity column so that a price
    // or an item number in the heading row cannot be mistaken for one.
    const sizes = headings
      .map((c, i) => [i, c] as [number, string])
      .filter(([i, c]) => qty >= 0 && i > qty && /^\d{2,3}(\.\d)?$/.test(c.trim()));
    const sku = headings.findIndex((c) => ITEM_HEADING.test(norm(c)));
    // What the shop pays. Their Volkl form prices both W/S and INDENT, and the shop's own costs are
    // the INDENT figure to the cent — the M7 Mantra at 749.55, the Griffon at 208.64 — so INDENT
    // is taken where there is one. This used to be left out altogether, and every Volkl line came
    // through with no cost.
    const indent = find(/^indent( price)?$/);
    const cost = indent >= 0 ? indent : find(/^(w s|ws|wholesale|whsl|dealer|cost)( price)?$/);
    return { at, end: n + 1 < heads.length ? heads[n + 1] : grid.length, sku, title: sku + 1, rrp: find(RRP), cost, colour: find(/^colou?r$/), qty, sizes };
  });
}

/** Read a sheet as an order form, or return null when nobody has written a quantity on it. */
function readOrder(name: string, grid: string[][]): InvoiceRead | null {
  const sections = sectionsOf(grid).filter((s) => s.sku >= 0 && (s.qty >= 0 || s.sizes.length > 0));
  if (sections.length === 0) return null;

  const lines: InvoiceLine[] = [];
  const priceList: PriceRow[] = [];
  let sizeGrid = false;
  // The tab says whose goods these are: "Volkl Ski", "Marker Inline 2025". The distributor's name
  // at the top of the form ("Sportrade Australia") is who sent them, not what they are.
  const tabBrand = brandIn(name);
  for (const section of sections) {
    for (let r = section.at + 1; r < section.end; r++) {
      const row = grid[r] ?? [];
      const sku = text(row[section.sku]);
      // No item code, no order — whatever numbers are on the row. See the "ADUILT RACE" row. And
      // an item code is a code: their footnote "** Indent Orders to be placed by 25th October 24"
      // sits in that column with a 5 beside it and would otherwise be a line of the delivery.
      if (!looksLikeItemCode(sku)) continue;
      // Their order form's first column says Flat, System or Binding — the difference between the
      // ski and the ski-with-binding, which the shop lists as two products at two prices.
      const kind = norm(text(row[0]));
      const form = kind === "flat" ? ("flat" as const) : kind === "system" ? ("package" as const) : undefined;
      const positive = (at: number) => (at >= 0 && (readNumber(text(row[at])) ?? 0) > 0 ? readNumber(text(row[at])) : null);
      const colour = section.colour >= 0 ? text(row[section.colour]) : "";
      const base = {
        sku,
        barcode: "",
        title: text(row[section.title]),
        ...(form ? { form } : {}),
        ...(colour ? { colour } : {}),
        ...(tabBrand ? { brand: tabBrand } : {}),
        costPrice: positive(section.cost),
        rrp: positive(section.rrp),
      };
      if (base.rrp !== null) priceList.push({ sku, title: base.title, colour, rrp: base.rrp, costPrice: base.costPrice });
      let onThisRow = 0;
      for (const [at, heading] of section.sizes) {
        const quantity = orderedQuantity(text(row[at]));
        if (quantity === null) continue;
        lines.push({ ...base, quantity, size: heading.trim() });
        onThisRow++;
        sizeGrid = true;
      }
      // A plain quantity column, for the tabs that have no size grid — one binding, five of them.
      // Skipped when the row already gave its lengths, where it is their sum.
      if (onThisRow === 0 && section.qty >= 0) {
        const quantity = orderedQuantity(text(row[section.qty]));
        if (quantity !== null) lines.push({ ...base, quantity });
      }
    }
  }
  if (lines.length === 0) return null;
  return {
    lines,
    priceList,
    sheet: name,
    columns: { barcode: "", sku: "Item No.", rrp: "RRP", quantity: sizeGrid ? "the length columns" : "QTY", title: 'the column beside "Item No."', size: sizeGrid ? "the column heading" : "", colour: "" },
    warnings: [],
  };
}

/** Every priced row of a size-grid form's sections, ordered or not. */
function readOrderPrices(grid: string[][]): PriceRow[] {
  const out: PriceRow[] = [];
  for (const section of sectionsOf(grid).filter((s) => s.sku >= 0 && s.rrp >= 0)) {
    for (let r = section.at + 1; r < section.end; r++) {
      const row = grid[r] ?? [];
      const sku = text(row[section.sku]);
      if (!looksLikeItemCode(sku)) continue;
      const num = (at: number) => (at >= 0 && (readNumber(text(row[at])) ?? 0) > 0 ? readNumber(text(row[at])) : null);
      const rrp = num(section.rrp);
      if (rrp === null) continue;
      out.push({ sku, title: text(row[section.title]), colour: section.colour >= 0 ? text(row[section.colour]) : "", rrp, costPrice: num(section.cost) });
    }
  }
  return out;
}

/** Read one sheet as an invoice, or decide it is not one. */
function readGrid(name: string, grid: string[][]): InvoiceRead | null {
  if (grid.length < 2) return null;
  const headerAt = detectHeaderRow(grid);
  const headings = (grid[headerAt] ?? []).map(text);
  const rows = grid.slice(headerAt + 1).filter((r) => (r ?? []).some((c) => text(c) !== ""));
  if (headings.length < 2 || rows.length === 0) return null;

  const barcode = pick(headings, rows, BARCODE, NOT_BARCODE, (v) => normaliseBarcode(v).length >= 8, true);
  const sku = pick(headings, rows, SKU, null, (v) => v.length >= 2 && v.length <= 40);
  if (!barcode && !sku) return null;

  const rrp = pick(headings, rows, RRP, NOT_RRP, (v) => (readNumber(v) ?? -1) > 0);
  const quantity = pick(headings, rows, QTY, null, (v) => readNumber(v) !== null);
  // Nothing to write is not an invoice. A list of barcodes and descriptions is a catalogue.
  if (!rrp && !quantity) return null;

  // Their order forms head the product-name column with the section it belongs to — "COMPETITION &
  // RACE", "PLATES", "UNIVERSAL Line" — so there is nothing to match on and the column beside the
  // item code is taken instead. It is named that way on screen rather than by its heading, which
  // would otherwise be shown as if it meant something.
  // One size per line, not the list of sizes a model comes in: "168/173/178/183" is the second,
  // and a line that says all four is not a line about one of them.
  const size = pick(headings, rows, SIZE, null, (v) => v.length <= 12 && !v.includes("/") && !v.includes(","));

  const colour = pick(headings, rows, COLOUR, null, (v) => v.length <= 30 && !/^\d+$/.test(v));
  const cost = pick(headings, rows, COST, NOT_COST, (v) => (readNumber(v) ?? -1) > 0);
  const gender = pick(headings, rows, GENDER, null, (v) => v.length <= 20 && !/\d/.test(v));
  const styleHeading = terrainColumn(headings, (h) => { const i = headings.indexOf(h); return rows.map((r) => text(r[i])); });
  const terrain = styleHeading === null ? -1 : headings.indexOf(styleHeading);

  const title = pick(headings, rows, TITLE, null, (v) => v.length >= 3 && !/^\d+$/.test(v))
    ?? (sku ? { index: sku.index + 1, heading: `the column beside "${sku.heading}"` } : null);

  /**
   * An order form, read flat: a quantity column that somebody has filled in on SOME rows.
   *
   * Burton's W27 form is their whole price list, 125 boards, with an ORDER QTY column that has a 1
   * against twelve of them. Every row of it was being read as a line of the delivery — 125 boards,
   * and the twelve that were actually bought were dropped altogether, because the amended lines
   * somebody typed in at the top carry no material number, no SKU and no EAN. On an order form the
   * quantity is what makes a row part of the delivery, and a description is enough to say what it
   * is: the name is matched to the shop, or to the description list, afterwards.
   */
  const orderedRows = quantity ? rows.filter((row) => orderedQuantity(text(row[quantity.index])) !== null) : [];
  const money = (c: Column | null, row: string[]) => (c && (readNumber(text(row[c.index])) ?? 0) > 0 ? readNumber(text(row[c.index])) : null);
  const priceList: PriceRow[] = rrp
    ? rows.filter((row) => money(rrp, row) !== null).map((row) => ({
        sku: sku ? text(row[sku.index]) : "",
        title: title ? text(row[title.index]) : "",
        colour: colour ? text(row[colour.index]) : "",
        rrp: money(rrp, row),
        costPrice: money(cost, row),
      }))
    : [];
  const asOrder = orderedRows.length > 0 && orderedRows.length < rows.length;

  const lines: InvoiceLine[] = [];
  let footers = 0;
  for (const row of asOrder ? orderedRows : rows) {
    const line: InvoiceLine = {
      sku: sku ? text(row[sku.index]) : "",
      barcode: barcode ? text(row[barcode.index]) : "",
      title: title ? text(row[title.index]) : "",
      ...(size ? { size: text(row[size.index]) } : {}),
      ...(colour ? { colour: text(row[colour.index]) } : {}),
      ...(gender && text(row[gender.index]) ? { gender: text(row[gender.index]) } : {}),
      ...(terrain >= 0 && text(row[terrain]) ? { terrain: text(row[terrain]) } : {}),
      costPrice: cost ? ((readNumber(text(row[cost.index])) ?? 0) > 0 ? readNumber(text(row[cost.index])) : null) : null,
      // A zero is not a price. Their order form prints 0 against the system bindings that come with
      // a ski, and writing that through would put "free" in front of a customer — which is exactly
      // why the rest of this app leaves a price cell empty rather than filling it with 0.00.
      rrp: rrp ? ((readNumber(text(row[rrp.index])) ?? 0) > 0 ? readNumber(text(row[rrp.index])) : null) : null,
      quantity: quantity ? readNumber(text(row[quantity.index])) : null,
    };
    // A row with no way to be matched is a subtotal, a section heading or a blank — not a line.
    // On an order form a description will do; "TOTAL ORDER QTY 12" has not even that.
    if (!normaliseBarcode(line.barcode) && !line.sku && !(asOrder && /[a-z]{3}/i.test(line.title))) { footers++; continue; }
    if (line.rrp === null && line.quantity === null) continue;
    lines.push(line);
  }
  if (lines.length === 0) return null;

  const heading = (c: Column | null) => c?.heading ?? "";
  // A column the kept lines leave empty is not what they are matched on: Burton's amended lines
  // have no EAN though the form has an EAN column.
  const used = (c: Column | null, of: (l: InvoiceLine) => string) => (lines.some((l) => of(l).trim()) ? heading(c) : "");
  return {
    lines,
    priceList,
    sheet: name,
    columns: { barcode: used(barcode, (l) => l.barcode), sku: used(sku, (l) => l.sku), rrp: heading(rrp), quantity: heading(quantity), title: heading(title), size: heading(size), colour: heading(colour) },
    warnings: asOrder
      ? [`Read as an order: ${lines.length} of ${rows.length - footers} rows on "${name}" have a quantity in ${quantity!.heading.trim()}, and only those are this delivery — the rest is the supplier's price list.${cost ? ` Cost from ${cost.heading.trim()}` : ""}${rrp ? `${cost ? "," : ""} retail from ${rrp.heading.trim()}` : ""}.`]
      : [],
  };
}

/**
 * Read a workbook as an invoice: every tab that is one, minus the tabs that repeat another.
 *
 * Their supplier workbooks run to a dozen tabs, and the two kinds look alike. One order is split by
 * category — Volkl Ski, Race Ski, Marker Inline, Accessory, Poles, Skins — and those are different
 * goods that all belong to the invoice. Then the same workbook carries a set of upload tabs holding
 * the same lines again in another shape, and those are the same goods twice. Reading only the
 * biggest tab loses five sixths of a real order; reading everything counts the skis twice.
 *
 * So tabs are taken biggest first, and one whose item codes are mostly codes already taken is a
 * restatement and is left out. Their December order comes through as its six category tabs, with
 * the four upload tabs dropped for overlapping them.
 */
export function readInvoiceGrids(grids: Array<{ name: string; grid: string[][] }>): InvoiceRead | null {
  /**
   * An order form that somebody has filled in beats the same form read as a list.
   *
   * Both readings work on the same workbook and they answer different questions. If a single cell
   * anywhere has a quantity written in it, this is a delivery and its lines are those cells — nine
   * of them, not the 375 models the form also happens to price. With nothing written in, it is a
   * price list and every row of it is a line, which is what a price update wants.
   */
  const ordered = grids.map((g) => readOrder(g.name, g.grid)).filter((r): r is InvoiceRead => r !== null);
  if (ordered.length > 0) {
    const lines = ordered.flatMap((o) => o.lines);
    // The whole form's prices, not only the tabs something was ordered from: the bindings a package
    // is priced from may sit on a tab with nothing ordered on it.
    const everyTab = grids.flatMap((g) => readOrderPrices(g.grid));
    return {
      lines,
      priceList: everyTab,
      shape: "grid",
      sheet: ordered.map((o) => o.sheet).join(", "),
      columns: ordered[0].columns,
      warnings: [`Read as an order: ${lines.length} line${lines.length === 1 ? "" : "s"} from the quantities written on ${ordered.length === 1 ? `the "${ordered[0].sheet}" tab` : `${ordered.length} tabs`}. The rest of the form is the supplier's price list, not this delivery, so it was left alone.`],
    };
  }

  const read = grids.map((g) => readGrid(g.name, g.grid)).filter((r): r is InvoiceRead => r !== null)
    .sort((a, b) => b.lines.length - a.lines.length);
  if (read.length === 0) return null;

  const keysOf = (r: InvoiceRead) => new Set(r.lines.map((l) => normaliseBarcode(l.barcode) || l.sku.toUpperCase()).filter(Boolean));
  const taken = new Set<string>();
  const kept: InvoiceRead[] = [];
  const dropped: Array<{ sheet: string; lines: number }> = [];
  for (const sheet of read) {
    const keys = keysOf(sheet);
    const seen = [...keys].filter((k) => taken.has(k)).length;
    if (kept.length > 0 && keys.size > 0 && seen / keys.size > 0.5) { dropped.push({ sheet: sheet.sheet, lines: sheet.lines.length }); continue; }
    for (const k of keys) taken.add(k);
    kept.push(sheet);
  }

  const first = kept[0];
  const warnings: string[] = kept.flatMap((k) => k.warnings);
  if (kept.length > 1) {
    warnings.push(`Read from ${kept.length} tabs: ${kept.map((k) => `"${k.sheet}" (${k.lines.length})`).join(", ")}.`);
  }
  if (dropped.length > 0) {
    warnings.push(`${dropped.map((d) => `"${d.sheet}"`).join(", ")} ${dropped.length === 1 ? "was" : "were"} left out — ${dropped.length === 1 ? "its" : "their"} item codes are already on the tabs above, so ${dropped.length === 1 ? "it is" : "they are"} the same order written a second way.`);
  }
  return {
    lines: kept.flatMap((k) => k.lines),
    priceList: kept.flatMap((k) => k.priceList ?? []),
    shape: "flat",
    sheet: kept.map((k) => k.sheet).join(", "),
    columns: first.columns,
    warnings,
  };
}
