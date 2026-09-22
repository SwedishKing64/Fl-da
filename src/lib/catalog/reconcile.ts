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
  /** The colourway this line is for, where the product comes in more than one. */
  colour?: string;
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
  /** Every row of the product the match landed on, narrowed or not. See applyInvoice. */
  productRows: number[];
  handle: string;
  key: MatchKey;
  /** What on the line was matched, for the screen: the barcode, the code, or the wording. */
  on: string;
  /** The line named a size this product does not have, so it could not be narrowed to one. */
  sizeMissing?: boolean;
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
  index: { byCode: Map<string, string[]>; wordsOf: Map<string, string[]>; nameCounts: Map<string, number>; variant: string },
): { handle: string; on: string; reason: string } {
  const miss = { handle: "", on: "", reason: "" };
  for (const key of nameKeysOf(line)) {
    const seen = index.nameCounts.get(`${key}\u0000${index.variant}`) ?? 0;
    const repeated = seen > 1;
    const words = key.split(" ");
    const handles = words.length === 1
      ? index.byCode.get(key) ?? []
      : [...index.wordsOf].filter(([, title]) => hasRun(title, words) || hasRun(words, title)).map(([handle]) => handle);
    if (handles.length === 0) continue;
    if (repeated) {
      return { ...miss, reason: `"${key}" is on ${seen} lines of the invoice for the same size, so it cannot say which is which` };
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
  if (rows.length <= 1) return rows;
  const options = ["Option1 Value", "Option2 Value", "Option3 Value"].map((c) => index.get(c)).filter((i): i is number => i !== undefined);
  const valuesOf = (r: number) => options.map((i) => (grid[r]?.[i] ?? "").trim()).filter(Boolean);

  let kept = rows;
  if ((line.size ?? "").trim()) {
    const want = sizeParts(line.size as string);
    const hit = kept.filter((r) => valuesOf(r).some((v) => sameSize(want, sizeParts(v))));
    if (hit.length > 0) kept = hit;
  }
  if (kept.length > 1 && (line.colour ?? "").trim()) {
    const want = expandColour(line.colour as string);
    const hit = kept.filter((r) => valuesOf(r).some((v) => sameColour(want, v)));
    if (hit.length > 0) kept = hit;
  }
  return kept;
}

/**
 * A size, as the two documents write it.
 *
 * Their Shopify options are "M (8)", "XL (9.5)", "S (6.5)", and a Swany invoice writes the same
 * sizes the other way round: "8.0-M", "9.5-XL", "6.5-S". Comparing the text gets none of them.
 * Some products carry only the letter — the SX-44AM mitt is S, M, ML, L, XL, 2XL with no
 * mondopoint at all — so whichever of the two both sides have is what is compared.
 */
function sizeParts(value: string): { letter: string; number: number | null } {
  const up = value.toUpperCase();
  const number = up.match(/\d+(?:\.\d+)?/);
  const word = up.match(/\b(EXTRA SMALL|SMALL|MEDIUM|LARGE)\b/);
  const letter = up.match(/(?<![A-Z])(XXS|XS|2XL|3XL|XXL|XL|ML|S|M|L)(?![A-Z])/);
  const fromWord = word ? { "EXTRA SMALL": "XS", SMALL: "S", MEDIUM: "M", LARGE: "L" }[word[1]] ?? "" : "";
  return { letter: fromWord || (letter ? letter[1] : ""), number: number ? Number(number[0]) : null };
}

/** Same size when everything both sides state agrees, and they state at least one thing. */
function sameSize(a: { letter: string; number: number | null }, b: { letter: string; number: number | null }): boolean {
  const letters = a.letter && b.letter ? a.letter === b.letter : null;
  const numbers = a.number !== null && b.number !== null ? Math.abs(a.number - b.number) < 0.01 : null;
  if (letters === false || numbers === false) return false;
  return letters === true || numbers === true;
}

/**
 * The trade's colour abbreviations, taken from the shop's own option values.
 *
 * An invoice line reads "SX-34L-BK" and the product's option says "Black". These two are not a
 * guess: their catalogue spells them out itself, in the options "Black (BK)" and "White (WH)".
 * Nothing else is assumed — an abbreviation this does not know simply does not narrow, and the
 * line stays on the whole product, where a price is still safe and a count is still skipped.
 */
const COLOUR_ALIAS: Record<string, string> = { BK: "BLACK", BLK: "BLACK", WH: "WHITE", WHT: "WHITE" };

const expandColour = (value: string): string => {
  const up = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return COLOUR_ALIAS[up] ?? up;
};

function sameColour(want: string, optionValue: string): boolean {
  if (!want) return false;
  const words = optionValue.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.includes(want) || words.some((w) => (COLOUR_ALIAS[w] ?? w) === want);
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
  /**
   * A name key two lines both offer, for the SAME variant, cannot place either of them.
   *
   * Counted per variant rather than per line, and that distinction is the whole of it. A Swany
   * invoice is a size grid: one row for the X-Cell glove, and under it "8.0-M: 1, 9.0-L: 2" — which
   * arrives as two lines both carrying SX-1M-BK. Those are not two claims on one product, they are
   * the two sizes of it, and counting them as a clash refused every line on the invoice and said
   * the product appeared twice when it did not.
   *
   * Two lines with the same code and the same size, or with no size at all, still clash. There is
   * genuinely nothing to tell them apart then.
   */
  const variantOf = (line: InvoiceLine): string =>
    `${(line.size ?? "").trim().toUpperCase()}\u0000${(line.colour ?? "").trim().toUpperCase()}`;
  const nameCounts = new Map<string, number>();
  for (const line of lines) {
    for (const key of nameKeysOf(line)) {
      const at = `${key}\u0000${variantOf(line)}`;
      nameCounts.set(at, (nameCounts.get(at) ?? 0) + 1);
    }
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
      const handle = handleOf.get(hit.rows[0]) ?? "";
      matched.push({ line, rows: [hit.rows[0]], productRows: rowsOf.get(handle) ?? [hit.rows[0]], handle, key: hit.key, on: hit.value });
      continue;
    }
    const clash = tries.find((t) => t.rows.length > 1 || (t.rows.length === 1 && t.onInvoice > 1));
    if (clash) {
      ambiguous.push({ line, reason: reasonFor(clash, handleOf), rows: clash.rows });
      continue;
    }

    // Nothing identified it exactly. Try the name — the only key a Swany invoice or a Volkl order
    // form offers, and the loose one, so it has to be unique on both sides like the others.
    const byName = placeByName(line, { byCode, wordsOf, nameCounts, variant: variantOf(line) });
    if (byName.handle) {
      const productRows = rowsOf.get(byName.handle) ?? [];
      const rows = narrowToSize(productRows, line, grid, index);
      if (rows.length > 0) {
        const sizeMissing = (line.size ?? "").trim() !== "" && rows.length === productRows.length && productRows.length > 1;
        matched.push({ line, rows, productRows, handle: byName.handle, key: "name", on: byName.on, ...(sizeMissing ? { sizeMissing: true } : {}) });
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
  const missingSizes: string[] = [];
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
    // A line whose size the listing does not have is reported as that, not also as a line with no
    // size on it — they are one problem and two messages about it read like two.
    if (m.sizeMissing) missingSizes.push(`${m.line.size} of ${m.handle}`);
    else if (spread && fields.quantity && m.line.quantity !== null) spreadQuantities++;

    /**
     * Which rows a PRICE goes on, when a line was narrowed to one size.
     *
     * A recommended retail is usually the product's, not the size's — so an invoice saying the
     * X-Cell mitt is now $229.99 where the shop has $219.99 should not leave five of its six sizes
     * on the old number. But it is not always: 459 of their products are priced per variant and
     * 609 are not, wax by the tin size and rope by the metre against gloves by the pair.
     *
     * So the file itself decides. Where every size of the product carries the SAME price today,
     * that is one price and it moves as one. Where they differ, the line speaks only for the size
     * it named, and the rest are left alone.
     */
    const together = (column: string): number[] => {
      // Only a NAME match widens. A barcode or a SKU names one variant and the invoice meant that
      // variant, so its price stays on it; a name was narrowed to a size by this tool, not by the
      // document, and the document was talking about the product.
      if (m.key !== "name" || m.rows.length !== 1 || m.productRows.length <= 1) return m.rows;
      const i = index.get(column);
      if (i === undefined) return m.rows;
      const values = new Set(m.productRows.map((at) => (rows[at - 1]?.[i] ?? "").trim()));
      return values.size === 1 ? m.productRows : m.rows;
    };
    const priceRows = fields.price ? together("Variant Price") : [];
    const rrpRows = fields.rrp ? together("Variant Compare At Price") : [];

    for (const at of new Set([...m.rows, ...priceRows, ...rrpRows])) {
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
      if (fields.rrp && rrp !== null && rrpRows.includes(at)) write("Variant Compare At Price", rrp.toFixed(2));
      if (fields.price && rrp !== null && priceRows.includes(at)) write("Variant Price", rrp.toFixed(2));
      if (!spread && fields.quantity && m.line.quantity !== null && m.rows.includes(at)) write("Variant Inventory Qty", String(Math.round(m.line.quantity)));
    }
  }
  if (missingSizes.length > 0) {
    warnings.push(`The invoice orders ${missingSizes.length === 1 ? "a size" : "sizes"} the listing does not have — ${missingSizes.slice(0, 4).join(", ")}${missingSizes.length > 4 ? `, and ${missingSizes.length - 4} more` : ""}. The price went on, the count could not: there is no variant to put it on. Add the size in Shopify first if it is a new one.`);
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
