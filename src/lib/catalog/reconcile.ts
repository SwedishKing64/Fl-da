/**
 * Matching a supplier's invoice to the products already in the shop.
 *
 * The other half of bulk changes. A rule ("everything 2025 into clearance") applies one value to
 * many products; an invoice does the opposite — it carries a different price, cost and quantity
 * for each line, and the job is to put each one on the right variant of a product that already
 * exists. Getting that join wrong writes a price onto the wrong ski, which is the worst thing
 * this tool can do, so the matching is deliberately strict and says what it could not place.
 *
 * The key is the BARCODE, which is not the obvious choice and is the measured one. Across this
 * shop's ten exports, of 4,659 variant rows:
 *
 *   with a SKU      154   (3.3%)
 *   with a barcode  3982  (85.5%)
 *   with neither    676   (14.5%)
 *
 * Their SKU column is all but empty — it is filled on one row in thirty — so a matcher built on
 * SKUs, which is what most systems assume, would have found nothing. SKU is kept as a second key
 * for the rows that do carry one.
 */

import { parseCsv } from "./csv";
import { quote, verifyOnlyIntended, type AdjustResult, type Change } from "./adjust";

/** What one line of a supplier document says, reduced to the parts a match needs. */
export interface InvoiceLine {
  sku: string;
  barcode: string;
  title: string;
  costPrice: number | null;
  rrp: number | null;
  quantity: number | null;
  /** The size or length this line is for, where the document gives one per line. */
  size?: string;
}

export type MatchKey = "barcode" | "sku" | "name";

export interface Match {
  line: InvoiceLine;
  /**
   * Indexes into the parsed grid, header row included, so a caller can write straight to them.
   *
   * A barcode or a SKU names one variant, so this is one row. A NAME names a product, which is
   * every size of it — and that difference decides what may be written. See applyInvoice.
   */
  rows: number[];
  handle: string;
  key: MatchKey;
  /** What on the line was matched, for the screen: the barcode, the code, or the wording. */
  on: string;
}

export interface Reconciliation {
  matched: Match[];
  /** Lines that matched nothing — normal, and listed so nobody assumes they were applied. */
  unmatched: InvoiceLine[];
  /**
   * Lines that matched more than one row, or whose key appears twice on the invoice. Never
   * applied: with two candidates there is no way to tell which price belongs where, and guessing
   * puts a number on a product nobody checked.
   */
  ambiguous: Array<{ line: InvoiceLine; reason: string; rows: number[] }>;
  /**
   * How many keys each side actually has.
   *
   * Nothing matching is the commonest outcome and "0 matched" says nothing about why. These four
   * numbers separate the three real causes: an invoice with no barcodes on it, an export with none
   * either, or both sides full of keys that simply do not meet. Their own Volkl order form is the
   * first of those — 375 lines, not one barcode — and without this it looks like a broken tool.
   */
  keys: { invoiceBarcodes: number; invoiceSkus: number; fileBarcodes: number; fileSkus: number };
}

/**
 * A barcode, comparable.
 *
 * Exports carry a leading apostrophe — Excel's way of keeping a long number a string — and it is
 * not part of the code. Leading zeros go too: a 12-digit UPC and the 13-digit EAN for the same
 * article differ by exactly that zero, and a supplier will quote whichever its system holds.
 */
export function normaliseBarcode(value: string): string {
  const digits = value.replace(/['"\s-]/g, "").trim();
  if (!/^\d+$/.test(digits)) return "";
  const trimmed = digits.replace(/^0+/, "");
  return trimmed.length >= 6 ? trimmed : "";
}

const normSku = (value: string): string => value.replace(/[\s'"]/g, "").toUpperCase();

/**
 * Why a line could not be placed, in terms of this shop's catalogue.
 *
 * The distinction matters because one of these is a mistake and the other is how the shop is
 * built. A barcode on two DIFFERENT products means someone typed one in twice. A barcode on
 * several rows of the SAME product is their package listings working as intended: a ski sold with
 * a binding carries the ski's barcode on both the mounted and the unmounted variant, which is why
 * 457 of the 474 barcodes in their ski export sit on more than one row. Neither is written to —
 * the two fitting options differ by the $55 mounting, so one price does not belong on both — but
 * being told which it is, is the difference between a file to fix and nothing to do.
 */
function reasonFor(
  clash: { key: MatchKey; value: string; rows: number[]; onInvoice: number },
  handleOf: Map<number, string>,
): string {
  if (clash.rows.length <= 1) return `${clash.key} ${clash.value} is on ${clash.onInvoice} lines of the invoice`;
  const handles = new Set(clash.rows.map((r) => handleOf.get(r) ?? ""));
  return handles.size === 1
    ? `${clash.key} ${clash.value} is on ${clash.rows.length} variants of ${[...handles][0]} — one price cannot belong to both`
    : `${clash.key} ${clash.value} is on ${clash.rows.length} rows across ${handles.size} different products`;
}


/**
 * Matching on the product's NAME, for the invoices that carry no barcode.
 *
 * Their Volkl order form has 375 lines and not one EAN on it, and a Swany invoice names its
 * goods the way the shop does — "SX-2M" against the SX-2M gloves. So a third key, after the two
 * that identify a variant exactly.
 *
 * It is the loose one, so it is the strictest. A name match must be a WHOLE token or a run of
 * whole tokens, never a substring: "CH8 Wax" and "CH10 Wax" are two products on their shelf and a
 * substring match would put one's price on the other. Punctuation and spacing inside a code are
 * ignored, because "SX-2M", "SX 2M" and "SX2M" are one code written three ways. And as with the
 * other keys, a name that finds more than one product is refused rather than resolved.
 *
 * What it identifies is a PRODUCT, not a variant — every size of the glove — which is why what
 * may be written to it is limited. See applyInvoice.
 */

/** Uppercase, punctuation to spaces, spaces collapsed. "Men's SX-2M!" -> "MEN S SX 2M". */
const normName = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * The part of a title that is the product's own name.
 *
 * Their package listings are "Peregrine 82 2026 inc Lowride 13 FR Binding Package": a ski, then
 * the binding it is sold with. Both are products the supplier invoices separately, so matching a
 * name against the whole title would put the BINDING's price onto the SKI that mentions it — and
 * silently, on the one ski that happened to be the only one with that binding. Everything from
 * "inc" onwards describes the other product, so nothing there is matched against.
 */
function ownName(title: string): string {
  const words = normName(title).split(" ").filter(Boolean);
  const inc = words.indexOf("INC");
  return (inc > 0 ? words.slice(0, inc) : words).join(" ");
}

/** A model code: letters then digits, run together however it was spaced. "SX 2M" -> "SX2M". */
function codesIn(title: string): Set<string> {
  const words = normName(title).split(" ").filter(Boolean);
  const out = new Set<string>();
  const take = (token: string) => {
    if (token.length >= 3 && token.length <= 12 && /^[A-Z]{1,4}\d/.test(token)) out.add(token);
  };
  for (let i = 0; i < words.length; i++) {
    take(words[i]);
    // "SX 2M" and "TA 0520" arrive split, because the shop writes the code with a space in it.
    if (i + 1 < words.length) take(words[i] + words[i + 1]);
  }
  return out;
}

/** True when `needle`'s tokens appear in `hay` as a run, whole tokens only. */
function hasRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

/**
 * What a line offers to be matched on by name, best first.
 *
 * The item code is tried before the wording. An invoice's description is written for a human and
 * drifts — "SX-2M Glove", "SX-2M Mens" — while its code is the thing both documents agree on.
 */
function nameKeysOf(line: InvoiceLine): string[] {
  const keys: string[] = [];
  const fromSku = codesIn(line.sku);
  for (const code of fromSku) keys.push(code);
  for (const code of codesIn(line.title)) if (!keys.includes(code)) keys.push(code);
  const words = normName(line.title).split(" ").filter(Boolean);
  // Wording is a last resort and only when there is enough of it to mean something. One common
  // word would match half the shelf, and be refused — but slowly, and for every line.
  if (words.length >= 2) keys.push(words.join(" "));
  return keys;
}

/**
 * Place one line by name, or say why it could not be.
 *
 * Codes first, then the wording, and at each step the answer has to be ONE product from the file
 * and ONE line from the invoice. Two candidates is not a near miss to be resolved by picking the
 * closest — it is a question for a person, and it is returned as one.
 */
function placeByName(
  line: InvoiceLine,
  index: { byCode: Map<string, string[]>; wordsOf: Map<string, string[]>; nameCounts: Map<string, number> },
): { handle: string; on: string; reason: string } {
  const miss = { handle: "", on: "", reason: "" };
  for (const key of nameKeysOf(line)) {
    const repeated = (index.nameCounts.get(key) ?? 0) > 1;
    const words = key.split(" ");
    const handles = words.length === 1
      ? index.byCode.get(key) ?? []
      : [...index.wordsOf].filter(([, title]) => hasRun(title, words) || hasRun(words, title)).map(([handle]) => handle);
    if (handles.length === 0) continue;
    if (repeated) {
      return { ...miss, reason: `"${key}" is on ${index.nameCounts.get(key)} lines of the invoice, so it cannot say which product is which` };
    }
    if (handles.length > 1) {
      return { ...miss, reason: `"${key}" matches ${handles.length} products — ${handles.slice(0, 3).join(", ")}${handles.length > 3 ? ", …" : ""}` };
    }
    return { handle: handles[0], on: key, reason: "" };
  }
  return miss;
}

/**
 * Narrow a product's rows to the one the line is about, when the line says which.
 *
 * An invoice for gloves is a line per size. Where it gives one and the product has a variant with
 * that option value, the line belongs to that variant alone; where it does not, it belongs to the
 * product, all sizes of it, and applyInvoice limits what that may write.
 */
function narrowToSize(rows: number[], line: InvoiceLine, grid: string[][], index: Map<string, number>): number[] {
  const want = (line.size ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!want || rows.length <= 1) return rows;
  const options = ["Option1 Value", "Option2 Value", "Option3 Value"].map((c) => index.get(c)).filter((i): i is number => i !== undefined);
  const hit = rows.filter((r) => options.some((i) => (grid[r]?.[i] ?? "").trim().toUpperCase().replace(/\s+/g, "") === want));
  return hit.length === 1 ? hit : rows;
}

/**
 * Match every line of an invoice to a variant row of a Shopify export.
 *
 * A key that is not unique on BOTH sides is refused rather than resolved. An invoice that lists
 * the same barcode twice, or an export that carries it on two rows, means somebody has to look —
 * and a tool that picks one silently is worse than one that says so.
 */
export function reconcile(csv: string, lines: InvoiceLine[]): Reconciliation {
  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0] ?? [];
  const index = new Map(header.map((h, i) => [h, i]));
  const at = (row: string[], column: string) => {
    const i = index.get(column);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  const byBarcode = new Map<string, number[]>();
  const bySku = new Map<string, number[]>();
  const handleOf = new Map<number, string>();
  let lastHandle = "";
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const handle = at(row, "Handle");
    if (handle) lastHandle = handle;
    handleOf.set(r, lastHandle);
    const barcode = normaliseBarcode(at(row, "Variant Barcodes") || at(row, "Variant Barcode"));
    if (barcode) byBarcode.set(barcode, [...(byBarcode.get(barcode) ?? []), r]);
    const sku = normSku(at(row, "Variant SKU"));
    if (sku) bySku.set(sku, [...(bySku.get(sku) ?? []), r]);
  }

  // The name index is by PRODUCT, not by row: a title is written once, on the handle's first row,
  // and what it names is every size of the thing.
  const rowsOf = new Map<string, number[]>();
  const titleOf = new Map<string, string>();
  for (let r = 1; r < grid.length; r++) {
    const handle = handleOf.get(r) ?? "";
    if (!handle) continue;
    rowsOf.set(handle, [...(rowsOf.get(handle) ?? []), r]);
    const title = at(grid[r], "Title");
    if (title && !titleOf.has(handle)) titleOf.set(handle, title);
  }
  const byCode = new Map<string, string[]>();
  const wordsOf = new Map<string, string[]>();
  for (const [handle, title] of titleOf) {
    const own = ownName(title);
    for (const code of codesIn(own)) byCode.set(code, [...(byCode.get(code) ?? []), handle]);
    wordsOf.set(handle, own.split(" ").filter(Boolean));
  }

  // A key the invoice itself repeats is ambiguous before the export is even consulted.
  const lineBarcodes = new Map<string, number>();
  const lineSkus = new Map<string, number>();
  for (const line of lines) {
    const b = normaliseBarcode(line.barcode);
    if (b) lineBarcodes.set(b, (lineBarcodes.get(b) ?? 0) + 1);
    const s = normSku(line.sku);
    if (s) lineSkus.set(s, (lineSkus.get(s) ?? 0) + 1);
  }
  // A name key two lines both offer cannot place either of them, for the same reason a repeated
  // barcode cannot: two prices, one product, and no way to tell which.
  const nameCounts = new Map<string, number>();
  for (const line of lines) {
    for (const key of nameKeysOf(line)) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const matched: Match[] = [];
  const unmatched: InvoiceLine[] = [];
  const ambiguous: Reconciliation["ambiguous"] = [];

  for (const line of lines) {
    const barcode = normaliseBarcode(line.barcode);
    const sku = normSku(line.sku);
    const tries: Array<{ key: MatchKey; value: string; rows: number[]; onInvoice: number }> = [];
    if (barcode) tries.push({ key: "barcode", value: barcode, rows: byBarcode.get(barcode) ?? [], onInvoice: lineBarcodes.get(barcode) ?? 0 });
    if (sku) tries.push({ key: "sku", value: sku, rows: bySku.get(sku) ?? [], onInvoice: lineSkus.get(sku) ?? 0 });

    const hit = tries.find((t) => t.rows.length === 1 && t.onInvoice === 1);
    if (hit) {
      matched.push({ line, rows: [hit.rows[0]], handle: handleOf.get(hit.rows[0]) ?? "", key: hit.key, on: hit.value });
      continue;
    }
    const clash = tries.find((t) => t.rows.length > 1 || (t.rows.length === 1 && t.onInvoice > 1));
    if (clash) {
      ambiguous.push({ line, reason: reasonFor(clash, handleOf), rows: clash.rows });
      continue;
    }

    // Nothing identified it exactly. Try the name — the only key a Swany invoice or a Volkl order
    // form offers, and the loose one, so it has to be unique on both sides like the others.
    const byName = placeByName(line, { byCode, wordsOf, nameCounts });
    if (byName.handle) {
      const rows = narrowToSize(rowsOf.get(byName.handle) ?? [], line, grid, index);
      if (rows.length > 0) {
        matched.push({ line, rows, handle: byName.handle, key: "name", on: byName.on });
        continue;
      }
    }
    if (byName.reason) {
      ambiguous.push({ line, reason: byName.reason, rows: [] });
      continue;
    }
    unmatched.push(line);
  }
  return {
    matched, unmatched, ambiguous,
    keys: {
      invoiceBarcodes: lines.filter((l) => normaliseBarcode(l.barcode)).length,
      invoiceSkus: lines.filter((l) => normSku(l.sku)).length,
      fileBarcodes: byBarcode.size,
      fileSkus: bySku.size,
    },
  };
}

/**
 * Which of an invoice's numbers to write.
 *
 * Named one by one rather than "update everything", because these are different decisions: a new
 * cost changes what the shop paid, a new recommended retail changes what the customer sees, and a
 * quantity is a stock count that is wrong the moment anything sells. Someone should say which.
 */
export interface InvoiceFields {
  /** Compare At, the recommended retail. */
  rrp?: boolean;
  /** Variant Price, set to the invoice's recommended retail — the shop prices at RRP. */
  price?: boolean;
  /** Variant Inventory Qty. */
  quantity?: boolean;
}

/**
 * Write an invoice's values onto the rows it matched.
 *
 * Only the cells asked for, only on rows that matched one line and one row, and every cell that
 * moves is reported so it can be read before anything is imported. The file is rebuilt through the
 * same passthrough serialiser and proved by the same check as every other change here — a cell
 * nobody asked about comes back byte for byte, or the original file is handed back instead.
 */
export function applyInvoice(csv: string, matched: Match[], fields: InvoiceFields): AdjustResult {
  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length < 2) return { csv, changes: [], matched: 0, products: 0, variantRows: 0, warnings: ["That file has no rows in it."] };
  const header = grid[0];
  const index = new Map(header.map((h, i) => [h, i]));
  const rows = grid.slice(1).map((r) => [...r]);
  const changes: Change[] = [];
  const warnings: string[] = [];

  const want: Array<[keyof InvoiceFields, string]> = [["rrp", "Variant Compare At Price"], ["price", "Variant Price"], ["quantity", "Variant Inventory Qty"]];
  for (const [key, column] of want) {
    if (fields[key] && !index.has(column)) warnings.push(`This export has no "${column}" column, so that part was skipped.`);
  }

  const touched = new Set<number>();
  let spreadQuantities = 0;
  for (const m of matched) {
    // Never a zero. An empty price cell means "leave it alone" to Shopify and a zero means free,
    // and a supplier document prints 0 for anything it does not price separately.
    const rrp = m.line.rrp !== null && m.line.rrp > 0 ? m.line.rrp : null;

    /**
     * A count belongs to one variant, a price belongs to the product.
     *
     * A line matched by barcode or SKU is one variant and both are safe. A line matched by NAME is
     * the whole product — every size of the glove — and the two numbers part company there. One
     * recommended retail across the sizes is how the shop already prices them, so it is written to
     * all of them. One stock count is not: writing "6 in stock" onto each of four sizes invents
     * twenty-four gloves. So a spread count is skipped and said out loud.
     */
    const spread = m.rows.length > 1;
    if (spread && fields.quantity && m.line.quantity !== null) spreadQuantities++;

    for (const at of m.rows) {
      const row = rows[at - 1];                // a match indexes the grid; rows drops the header
      if (!row) continue;
      touched.add(at);
      const title = (row[index.get("Title") ?? -1] ?? "").trim();
      const write = (column: string, value: string) => {
        const i = index.get(column);
        if (i === undefined || value === "") return;
        const before = (row[i] ?? "").trim();
        if (before === value) return;
        while (row.length <= i) row.push("");
        row[i] = value;
        changes.push({ handle: m.handle, title, column, before, after: value });
      };
      if (fields.rrp && rrp !== null) write("Variant Compare At Price", rrp.toFixed(2));
      if (fields.price && rrp !== null) write("Variant Price", rrp.toFixed(2));
      if (!spread && fields.quantity && m.line.quantity !== null) write("Variant Inventory Qty", String(Math.round(m.line.quantity)));
    }
  }
  if (spreadQuantities > 0) {
    warnings.push(`${spreadQuantities} line${spreadQuantities === 1 ? "" : "s"} matched a product by name rather than a barcode, so ${spreadQuantities === 1 ? "its count was" : "their counts were"} left alone — a name says which product, not which size, and one count written onto every size invents stock. The prices went on. For counts, the invoice needs barcodes or a size per line.`);
  }

  const out = [header, ...rows].map((row) => header.map((_, i) => quote(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";
  const unintended = verifyOnlyIntended(grid, out, changes);
  if (unintended.length > 0) {
    return {
      csv, changes: [], matched: 0, products: 0, variantRows: rows.length, refused: true,
      warnings: [`The file was NOT changed. A check found ${unintended.length} cell${unintended.length === 1 ? "" : "s"} that would have moved without being asked to, which is a fault in this tool rather than anything you did. Please report it.`, ...unintended.slice(0, 5)],
    };
  }
  return { csv: out, changes, matched: touched.size, products: new Set(rows.map((r) => (r[index.get("Handle") ?? -1] ?? "").trim()).filter(Boolean)).size, variantRows: rows.length, warnings };
}
