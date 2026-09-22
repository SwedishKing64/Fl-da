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
}

export type MatchKey = "barcode" | "sku";

export interface Match {
  line: InvoiceLine;
  /** Index into the parsed grid, header row included, so a caller can write straight to it. */
  row: number;
  handle: string;
  key: MatchKey;
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

  // A key the invoice itself repeats is ambiguous before the export is even consulted.
  const lineBarcodes = new Map<string, number>();
  const lineSkus = new Map<string, number>();
  for (const line of lines) {
    const b = normaliseBarcode(line.barcode);
    if (b) lineBarcodes.set(b, (lineBarcodes.get(b) ?? 0) + 1);
    const s = normSku(line.sku);
    if (s) lineSkus.set(s, (lineSkus.get(s) ?? 0) + 1);
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
      matched.push({ line, row: hit.rows[0], handle: handleOf.get(hit.rows[0]) ?? "", key: hit.key });
      continue;
    }
    const clash = tries.find((t) => t.rows.length > 1 || (t.rows.length === 1 && t.onInvoice > 1));
    if (clash) {
      ambiguous.push({
        line,
        reason: clash.rows.length > 1
          ? `${clash.key} ${clash.value} is on ${clash.rows.length} rows of the export`
          : `${clash.key} ${clash.value} is on ${clash.onInvoice} lines of the invoice`,
        rows: clash.rows,
      });
      continue;
    }
    unmatched.push(line);
  }
  return { matched, unmatched, ambiguous };
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
  for (const m of matched) {
    const r = m.row - 1;                       // matched.row indexes the grid; rows drops the header
    const row = rows[r];
    if (!row) continue;
    touched.add(m.row);
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
    if (fields.rrp && m.line.rrp !== null) write("Variant Compare At Price", m.line.rrp.toFixed(2));
    if (fields.price && m.line.rrp !== null) write("Variant Price", m.line.rrp.toFixed(2));
    if (fields.quantity && m.line.quantity !== null) write("Variant Inventory Qty", String(Math.round(m.line.quantity)));
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
