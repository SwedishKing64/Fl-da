import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { ExtractedTable } from "./types";

/** Heuristic: the header row is the first row with >= 3 non-empty cells that are mostly non-numeric. */
export function detectHeaderRow(grid: string[][]): number {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = grid[i].map((c) => (c ?? "").trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const textual = cells.filter((c) => !/^[-+$€£]?\d[\d,.]*%?$/.test(c)).length;
    if (textual / cells.length >= 0.7) return i;
  }
  return 0;
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

export async function extractXlsx(buffer: Buffer, sheetName?: string): Promise<ExtractedTable> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets.find((s) => s.rowCount > 0) || wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [], method: "XLSX", warnings: ["Workbook has no sheets"] };
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellToString(cell.value);
    });
    grid[rowNumber - 1] = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
  });
  const compact = grid.filter(Boolean);
  const warnings = wb.worksheets.length > 1 ? [`Workbook has ${wb.worksheets.length} sheets; used "${sheet.name}".`] : [];
  return gridToTable(compact, "XLSX", warnings);
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
    return { name: sheet.name, grid: grid.map((r) => r ?? []) };
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
