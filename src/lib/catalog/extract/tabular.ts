import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { ExtractedTable } from "./types";
import { foldQuantityColumns, readInvoiceGrids } from "../invoice";
import type { InvoiceLine } from "../reconcile";

/**
 * Which row the column names are on.
 *
 * It used to take the first row with three text cells in it, which is fine for a file that starts
 * with its header and wrong for every supplier order sheet, because those open with a letterhead:
 * "Customer:", "Address:", "Suburb:", "email:" — three text cells apiece, rows above the real
 * header, and each one of them won. The whole sheet was then read one column wide.
 *
 * The header is instead the WIDEST plausible row near the top. A letterhead line is two or three
 * cells; a header names every column there is, so on a real sheet it is several times wider than
 * anything above it. Ties go to the earliest row, and a row of numbers is never a header.
 */
export function detectHeaderRow(grid: string[][]): number {
  let best = -1;
  let width = 0;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = grid[i].map((c) => (c ?? "").trim()).filter(Boolean);
    if (cells.length < 3) continue;
    // A row of numbers is never a header — but a header row is not always words. Their supplier
    // order forms are size grids: "Item No. | Sizes | RRP | W/S | 148 | 150 | 153 | 155 | …", where
    // two thirds of the headings are ski lengths. Demanding 70% words rejected the only real
    // header on the sheet and settled on "State: | Delivery Date | 2026-05-01" six rows above it.
    // Three words and a third of the row keeps a data row out while letting a size grid in; which
    // row wins is then decided by distinct width below, where a header beats its own data easily.
    const textual = cells.filter((c) => !/^[-+$€£]?\d[\d,.]*%?$/.test(c)).length;
    if (textual < 3 || textual / cells.length < 0.33) continue;
    // Distinct values, not cells. A title merged across the sheet — "2025/26 Ski Price-List" —
    // arrives as that one phrase repeated in all thirty-three columns, which is wider than the
    // header underneath it and is not a header at all. Column names do not repeat.
    const distinct = new Set(cells.map((c) => c.toLowerCase())).size;
    // A header sits ABOVE its data, so an earlier candidate keeps the row unless a later one is
    // clearly wider — a fifth more, not one cell more. Without the margin, a data row carrying one
    // extra filled-in cell took the header's place on a sheet whose header was the very first row.
    if (distinct > width * 1.2) { width = distinct; best = i; }
  }
  return best === -1 ? 0 : best;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = (h ?? "").toString().trim() || `Column ${i + 1}`;
    const n = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    return name;
  });
}

/**
 * An order, as the table the rest of the pipeline expects.
 *
 * One row per ordered length, with the two keys the other files join on: the model code as the
 * supplier writes it, and a per-length SKU — "V2610112.000.170" — which is exactly the spelling
 * the PIM export uses in its "SKU no. // LENGTH" column and what carries the barcode.
 */
export function orderToTable(order: { lines: InvoiceLine[]; sheet: string; warnings: string[] }, method: ExtractedTable["method"] = "XLSX"): ExtractedTable {
  // Cost and colour too: dropping them left every Volkl line with no cost, though the form prices
  // every row, and the Griffon with no colour to tell its black from its orange.
  // Barcode, gender and size too: the reader finds them on any supplier's form, and a form with a
  // line per size (Osprey's S/M and L/XL) has a size where a ski has a length.
  // The kind of thing a line is, where the form's own section says ("ALL TERRAIN SKIS", "POLES").
  const kinds = order.lines.some((l) => (l.kind ?? "").trim());
  // What a ski is for, where the form says — its section and waist (see grid-form.ts).
  const terrains = order.lines.some((l) => (l.terrain ?? "").trim());
  const headers = ["Item No.", "SKU", "Barcode", "Brand", "Description", ...(kinds ? ["Category"] : []), ...(terrains ? ["Terrain"] : []), "Gender", "Colour", "Length", "Size", "RRP", "Cost", "Qty"];
  // A code on more than one line is the model's, not the variant's: a size grid writes the style's
  // code once per size ordered. Each variant needs a SKU of its own, so the size goes on the end
  // ("OW3101.S", "PK2745.SM"), the way a length already did; the model's code stays in Item No.
  // A model ordered in two colours repeats once more, so the colour goes on too where the size alone
  // does not tell the lines apart ("OW3101-Navy.S").
  const count = (keys: string[]) => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
  const condensed = (v: string | undefined) => (v ?? "").replace(/[^A-Za-z0-9.]/g, "");
  const bySku = count(order.lines.map((l) => l.sku));
  const bySkuSize = count(order.lines.map((l) => `${l.sku}.${condensed(l.size)}`));
  const rows = order.lines.map((line) => {
    const size = (line.size ?? "").trim();
    // A ski or pole length is a whole number of centimetres, 60 and up; a boot's 24.5 is a size.
    // A board's wide length, 158W, is a length too.
    const length = /^\d{2,3}(\.\d)?w?$/i.test(size) && parseInt(size, 10) >= 60 && !(line.kind ?? "").match(/boot/i) ? size : "";
    const colourToo = (bySkuSize.get(`${line.sku}.${condensed(size)}`) ?? 0) > 1 && condensed(line.colour) ? `-${condensed(line.colour)}` : "";
    const perSize = size && (bySku.get(line.sku) ?? 0) > 1 ? `${line.sku}${colourToo}.${condensed(size)}` : "";
    return {
      "Item No.": line.sku,
      // The per-length SKU the spec sheets use — but a code that is already per size stands alone.
      SKU: length ? `${line.sku}${colourToo}.${length}` : perSize || line.sku,
      Barcode: (line.barcode ?? "").trim(),
      Brand: (line.brand ?? "").trim(),
      Description: line.title,
      ...(kinds ? { Category: (line.kind ?? "").trim() } : {}),
      ...(terrains ? { Terrain: (line.terrain ?? "").trim() } : {}),
      Gender: (line.gender ?? "").trim(),
      Colour: (line.colour ?? "").trim(),
      Length: length,
      Size: length ? "" : size,
      RRP: line.rrp === null ? "" : String(line.rrp),
      Cost: line.costPrice === null ? "" : String(Math.round(line.costPrice * 100) / 100),
      Qty: line.quantity === null ? "" : String(line.quantity),
    };
  });
  return {
    headers,
    rows,
    method,
    warnings: [
      `Read as an order: ${rows.length} line${rows.length === 1 ? "" : "s"} from the quantities written on ${order.sheet}. The rest of the form is the supplier's price list, not this delivery, so it was left out.`,
      ...order.warnings.filter((w) => !w.startsWith("Read as an order")),
    ],
  };
}

export function gridToTable(source: string[][], method: ExtractedTable["method"], warnings: string[] = []): ExtractedTable {
  // A quantity column per delivery month is one quantity: see foldQuantityColumns.
  const folded = foldQuantityColumns(source, detectHeaderRow(source));
  if (folded.note) warnings.push(folded.note);
  const grid = folded.grid;
  const headerIndex = detectHeaderRow(grid);
  const headers = uniqueHeaders(grid[headerIndex] ?? []);
  const rows: Record<string, string>[] = [];
  for (let r = headerIndex + 1; r < grid.length; r++) {
    const line = grid[r] ?? [];
    if (line.every((c) => !(c ?? "").toString().trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (line[i] ?? "").toString().trim();
    });
    rows.push(row);
  }
  if (headerIndex > 0) warnings.push(`Header row detected at line ${headerIndex + 1}; earlier lines ignored.`);
  return { headers, rows, method, warnings };
}

export function extractCsv(buffer: Buffer): ExtractedTable {
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const warnings = parsed.errors.slice(0, 5).map((e) => `CSV parse warning (row ${e.row ?? "?"}): ${e.message}`);
  const grid = parsed.data.map((r) => r.map((c) => (c ?? "").toString()));
  // A size grid sent as a CSV is the same order as one sent as a workbook: one line per size
  // ordered, not one per row. It went straight to the column matcher, which cannot read a grid.
  const order = readInvoiceGrids([{ name: "CSV", grid }]);
  // Only a real size grid: a flat CSV with an item code and a quantity is a table already, and read
  // as one it keeps every column.
  if (order && order.shape === "grid" && order.columns.size === "the column heading" && order.lines.some((l) => l.quantity !== null)) {
    const table = orderToTable(order);
    return { ...table, method: "CSV", warnings: [...warnings, ...table.warnings] };
  }
  return gridToTable(grid, "CSV", warnings);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value && value.text !== undefined) return String(value.text);
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("hyperlink" in value) return String(value.hyperlink);
    return "";
  }
  return String(value);
}

/**
 * Read the sheet of a workbook that actually holds the products.
 *
 * It used to take the first sheet with any rows on it. A supplier's order workbook opens with a
 * cover sheet — "Order Total", a letterhead and a few totals — and puts the goods on the sheets
 * after it: Volkl Ski, Race Ski, Marker Inline, Poles. So the one sheet that was read was the one
 * with no products on it, and 700-odd order lines were never seen. That is not a file that failed
 * to read; it is a file that read perfectly and returned the wrong page.
 *
 * Each sheet is scored on how much of a table it is — rows under a header, times columns in that
 * header — and the best one wins. The others are named in the warnings with their sizes, because a
 * workbook whose goods are split across sheets needs a person to say which, and being told "there
 * are 4 more sheets and here is what is on them" is the whole of that decision.
 */
export async function extractXlsx(buffer: Buffer, sheetName?: string): Promise<ExtractedTable> {
  const sheets = await sheetGrids(buffer);
  if (sheets.length === 0) return { headers: [], rows: [], method: "XLSX", warnings: ["Workbook has no sheets"] };

  /**
   * An order form is read as the order, not as the price list it is printed on.
   *
   * Their Volkl workbook prices the whole range — 375 models over a dozen tabs — and the delivery
   * is the nine cells somebody wrote a number in. Read as a table it built 375 products, which is
   * not a near miss: it is the supplier's catalogue arriving as this month's stock. Read as an
   * order it builds the six skis and the binding that were actually bought, one variant per
   * length, with the item code carried per length so the spec and barcode sheets can join to it.
   *
   * Only when a quantity has been written in. A blank form is a price list and still reads as one.
   */
  if (!sheetName) {
    const order = readInvoiceGrids(sheets);
    // A flat order form — a row per line with an ORDER QTY column, as Burton's is — is already a
    // table, and read as one it keeps its cost, gender and every other column; the pipeline keeps
    // only the rows with a quantity (keepOrderedLines). Only a size grid needs turning into rows.
    if (order && order.shape === "grid" && order.lines.some((l) => l.quantity !== null)) {
      return orderToTable(order);
    }
  }

  const scored = sheets.map(({ name, grid }) => {
    const compact = grid.filter((r) => r && r.some((c) => (c ?? "").trim()));
    const header = detectHeaderRow(compact);
    const columns = (compact[header] ?? []).filter((c) => (c ?? "").trim()).length;
    const dataRows = Math.max(0, compact.length - header - 1);
    // Cells with something in them, not columns times rows. A supplier's order form is a size grid
    // — thirty-odd headings, of which twenty are ski lengths with an empty box under each waiting
    // for a quantity — so by its header width it is the biggest table in the workbook and by what
    // is actually on it, it is not. Counting what is filled in reads it as the mostly-empty form
    // it is, and still prefers a real wide table over a narrow one.
    const filled = compact.slice(header + 1).reduce((n, r) => n + r.filter((c) => (c ?? "").trim()).length, 0);
    return { name, grid: compact, columns, dataRows, score: columns >= 2 ? filled : 0 };
  });

  const wanted = sheetName ? scored.find((s) => s.name === sheetName) : undefined;
  const chosen = wanted ?? scored.reduce((a, b) => (b.score > a.score ? b : a));

  /**
   * Tabs with the same headings are one table, split up for somebody's convenience.
   *
   * A supplier's description list or barcode list often comes a tab per product family — skis on
   * one, bindings on the next — with identical columns on each. Only one tab was read, and the page
   * said to "upload the file again for each of those you need", which nobody can do usefully. Tabs
   * whose heading row is the same as the chosen one's are now read with it, in workbook order. A
   * tab with DIFFERENT headings is a different table — Volkl's "Order Total" summary beside its ski
   * tab — and is still left out and named.
   */
  const headingsOf = (t: (typeof scored)[number]) =>
    (t.grid[detectHeaderRow(t.grid)] ?? []).map((c) => (c ?? "").toString().trim().toLowerCase()).filter(Boolean).join("\u0000");
  const same = wanted ? [] : scored.filter((t) => t !== chosen && t.dataRows > 0 && headingsOf(t) === headingsOf(chosen));
  const grid = same.length === 0 ? chosen.grid : [
    ...chosen.grid,
    ...same.flatMap((t) => t.grid.slice(detectHeaderRow(t.grid) + 1)),
  ];

  const warnings: string[] = [];
  if (same.length > 0) {
    warnings.push(`Read ${same.length + 1} tabs with the same columns as one list: ${[chosen, ...same].map((t) => `"${t.name}" (${t.dataRows} rows)`).join(", ")}.`);
  }
  const others = scored.filter((t) => t !== chosen && !same.includes(t) && t.dataRows > 0);
  if (others.length > 0) {
    warnings.push(
      `Also in this workbook, with different columns, and not read: ${others.map((t) => `"${t.name}" (${t.dataRows} rows)`).join(", ")}. If one of those is what you meant, save it as its own file.`,
    );
  }
  return gridToTable(grid, "XLSX", warnings);
}


/**
 * Every sheet of a workbook, as a grid.
 *
 * extractXlsx picks one sheet and reads it as a table of products. A template is not that: it has
 * its instructions on one tab and its notes and vocabulary on others, and which tab is which is
 * only decided by looking at the headings on each. So this hands back all of them, untouched.
 */
export async function sheetGrids(buffer: Buffer): Promise<Array<{ name: string; grid: string[][] }>> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err) {
    // A workbook that has been round the office picks up cell comments, and the reader throws on
    // some of them rather than ignoring them — a note somebody left on a heading is not a reason
    // to refuse the sheet. They hold nothing this needs, so they are taken out and it is read
    // again. Anything else still throws.
    if (!/comments/i.test(err instanceof Error ? err.message : String(err))) throw err;
    await wb.xlsx.load(await withoutComments(buffer) as unknown as ExcelJS.Buffer);
  }
  return wb.worksheets.map((sheet) => {
    const grid: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellToString(cell.value);
      });
      grid[rowNumber - 1] = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
    });
    // Array.from, not grid.map: eachRow skips empty rows, so grid is SPARSE, and map walks past a
    // hole without calling its callback — the ?? never ran and the hole came out the other side.
    // A workbook with a blank row in it then crashed whatever read it, on grid[i].map of undefined.
    return { name: sheet.name, grid: Array.from(grid, (r) => r ?? []) };
  });
}

/** The same workbook with its cell comments removed, for a reader that will not tolerate them. */
async function withoutComments(buffer: Buffer): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const drop = Object.keys(zip.files).filter((n) => /xl\/(comments|threadedComments)|commentsDrawing|vmlDrawing/i.test(n));
  for (const name of drop) zip.remove(name);
  // The relationships pointing at them have to go too, or the reader looks for a part that is now
  // missing and fails in a different place.
  for (const name of Object.keys(zip.files).filter((n) => /_rels\/.*\.rels$/.test(n))) {
    const xml = await zip.file(name)!.async("string");
    const cleaned = xml.replace(/<Relationship\b[^>]*?(?:comments|vmlDrawing)[^>]*?\/>/gi, "");
    if (cleaned !== xml) zip.file(name, cleaned);
  }
  const types = zip.file("[Content_Types].xml");
  if (types) {
    const xml = await types.async("string");
    zip.file("[Content_Types].xml", xml.replace(/<Override\b[^>]*?(?:comments|vmlDrawing)[^>]*?\/>/gi, ""));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
