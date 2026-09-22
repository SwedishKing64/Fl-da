import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { ExtractedTable } from "./types";

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

export function gridToTable(grid: string[][], method: ExtractedTable["method"], warnings: string[] = []): ExtractedTable {
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
  return gridToTable(parsed.data.map((r) => r.map((c) => (c ?? "").toString())), "CSV", warnings);
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

  const warnings: string[] = [];
  const others = scored.filter((s) => s.name !== chosen.name && s.dataRows > 0);
  if (others.length > 0) {
    warnings.push(
      `This workbook has ${scored.length} sheets and only one can be read at a time. Read "${chosen.name}" (${chosen.dataRows} rows under ${chosen.columns} columns). Also in it: ${others.map((s) => `"${s.name}" (${s.dataRows} rows)`).join(", ")} — upload the file again for each of those you need.`,
    );
  }
  return gridToTable(chosen.grid, "XLSX", warnings);
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
