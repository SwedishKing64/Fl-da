// Generates the sample supplier files and the expected Shopify CSV / profit figures used as
// regression fixtures. Run with `npm run catalog:fixtures` after intentionally changing the
// pricing or CSV rules, then review the diff in samples/expected before committing.

import { promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { buildFixtures } from "./fixtures";

async function main() {
  const dir = path.resolve("samples");
  const f = buildFixtures();

  await fs.writeFile(path.join(dir, "atomic-prebook.csv"), f.atomic.csvSource, "utf8");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice");
  ws.addRow(["VÖLKL / MARKER AUSTRALIA"]);
  ws.addRow(["Tax Invoice 88213", "", "", "Prices are USD, no GST"]);
  ws.addRow([]);
  ws.addRow(f.volkl.headers);
  for (const r of f.volkl.rows) ws.addRow(f.volkl.headers.map((h) => (r as Record<string, string | number>)[h]));
  await wb.xlsx.writeFile(path.join(dir, "volkl-invoice.xlsx"));

  await fs.writeFile(path.join(dir, "burton-invoice.txt"), f.burton.text, "utf8");
  await fs.writeFile(path.join(dir, "burton-invoice.pdf"), textToPdf(f.burton.text));

  await fs.mkdir(path.join(dir, "expected"), { recursive: true });
  for (const [name, result] of Object.entries(f.results)) {
    await fs.writeFile(path.join(dir, "expected", `${name}.shopify.csv`), result.csv, "utf8");
  }
  await fs.writeFile(
    path.join(dir, "expected", "profit.json"),
    JSON.stringify(Object.fromEntries(Object.entries(f.results).map(([k, r]) => [k, { summary: r.summary, variants: r.products.flatMap((p) => p.variants.map((v) => ({ sku: v.sku, landedCostHome: v.landedCostHome, retailPrice: v.retailPrice, exGstRevenue: v.exGstRevenue, gstComponent: v.gstComponent, profitPerUnit: v.profitPerUnit, marginPct: v.marginPct }))), errors: r.errors, warnings: r.warnings }])), null, 2) + "\n",
    "utf8",
  );
  console.log("Fixtures written to samples/");
}

/** Minimal single-font PDF writer (one text line per PDF text object) so the sample is a real PDF. */
function textToPdf(text: string): Buffer {
  const lines = text.split("\n");
  const content = lines.map((l, i) => `BT /F1 9 Tf 40 ${800 - i * 13} Td (${l.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

main().catch((e) => { console.error(e); process.exit(1); });
