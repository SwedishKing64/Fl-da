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
