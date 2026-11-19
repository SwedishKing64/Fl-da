/**
 * Make a pilot shop's real supplier documents safe to share: every amount disguised by one factor
 * per document, never written down, so the layout and the arithmetic stay true but no figure is the
 * real one. See src/lib/catalog/redact.ts and docs/PILOT.md.
 *
 *   npx tsx scripts/redact.ts <file>... [--out <dir>]
 *
 * CSV and XLSX come out in the same format, with an answer-key draft beside them (`checked: false`)
 * for a person to correct; the scorer skips a key until it says `checked: true`. A PDF with text
 * comes out as that text. A scan or photo cannot be disguised here: cover the prices by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { disguiseFactor, disguiseGrid, disguiseText, headingRow, isMoneyHeading, scaleAmount } from "../src/lib/catalog/redact";
import { extractFile } from "../src/lib/catalog/extract";
import { extractPdfText } from "../src/lib/catalog/extract/pdf";
import { linesFromTable } from "../src/lib/catalog/corpus";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : "redacted";
const files = args.filter((a, i) => a !== "--out" && i !== outAt + 1);

async function disguiseWorkbook(buffer: Buffer, factor: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  wb.eachSheet((sheet) => {
    const grid: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, r) => {
      grid[r - 1] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => { grid[r - 1][c - 1] = cell.text ?? ""; });
    });
    const head = headingRow(grid.map((r) => r ?? []));
    const money = new Set(head < 0 ? [] : (grid[head] ?? []).map((c, i) => (isMoneyHeading(c ?? "") ? i + 1 : -1)).filter((i) => i > 0));
    sheet.eachRow((row, r) => {
      if (r - 1 <= head) return;
      row.eachCell((cell, c) => {
        const v = cell.value;
        if (typeof v === "number") { if (money.has(c)) cell.value = Math.round(v * factor * 100) / 100; return; }
        if (v && typeof v === "object" && "formula" in v && typeof v.result === "number") {
          if (money.has(c)) cell.value = { ...v, result: Math.round(v.result * factor * 100) / 100 };
          return;
        }
        if (typeof v === "string") cell.value = money.has(c) ? scaleAmount(v, factor) : disguiseText(v, factor);
      });
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function keyDraft(file: string, mime: string): Promise<void> {
  const keyPath = join(out, `${basename(file, extname(file))}.key.json`);
  if (existsSync(keyPath)) return;
  const { table } = await extractFile(readFileSync(file), basename(file), mime, "INVOICE");
  const lines = linesFromTable(table).map((l) => ({
    code: l.sku || l.barcode || l.modelCode, name: l.title, quantity: l.quantity ?? 0,
    ...(l.costPrice !== null ? { cost: l.costPrice } : {}), ...(l.rrp !== null ? { rrp: l.rrp } : {}),
    ...(l.size ? { size: l.size } : {}), ...(l.colour ? { colour: l.colour } : {}), ...(l.variant ? { option: l.variant } : {}),
  }));
  writeFileSync(keyPath, JSON.stringify({ checked: false, trade: "", kind: extname(file).slice(1), lines }, null, 2) + "\n");
  console.log(`  answer key drafted: ${keyPath} — check every line against the document, fill in trade and totals, then set "checked": true`);
}

async function main(): Promise<void> {
  if (files.length === 0) { console.error("Name the files to disguise: npx tsx scripts/redact.ts invoice.xlsx [--out redacted]"); process.exit(1); }
  mkdirSync(out, { recursive: true });
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const factor = disguiseFactor();
    const target = join(out, basename(file));
    if (ext === ".csv") {
      const grid = Papa.parse<string[]>(readFileSync(file, "utf8").replace(/^﻿/, ""), { skipEmptyLines: "greedy" }).data;
      writeFileSync(target, Papa.unparse(disguiseGrid(grid, factor)) + "\n");
      console.log(`${file} → ${target}`);
      await keyDraft(target, "text/csv");
    } else if (ext === ".xlsx") {
      writeFileSync(target, await disguiseWorkbook(readFileSync(file), factor));
      console.log(`${file} → ${target}`);
      await keyDraft(target, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } else if (ext === ".pdf") {
      const pdf = await extractPdfText(readFileSync(file));
      if (pdf.looksScanned) { console.log(`${file}: a scan, with no text to disguise. Cover the prices by hand before sharing it.`); continue; }
      const txt = join(out, `${basename(file, ext)}.txt`);
      writeFileSync(txt, disguiseText(pdf.text, factor) + "\n");
      console.log(`${file} → ${txt} (its text; amounts disguised)`);
    } else if (ext === ".txt") {
      writeFileSync(target, disguiseText(readFileSync(file, "utf8"), factor));
      console.log(`${file} → ${target}`);
    } else {
      console.log(`${file}: a photo or another format, which this cannot disguise. Cover the prices by hand before sharing it.`);
    }
  }
  console.log("\nThe factor used on each file is not kept anywhere. Check every disguised file by eye before it leaves the shop.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
