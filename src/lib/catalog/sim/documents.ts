/**
 * A delivery rendered the ways suppliers send them, each beside the truth it was rendered from.
 *
 * The same order can arrive as a flat CSV under any of several heading vocabularies, as a size grid
 * with the sizes across the top, as a workbook with the supplier's letterhead above the table and
 * the totals below it, as a price list of the whole range with quantities written against a few
 * rows, as a distributor's invoice mixing brands, or as a printed page: text, a PDF, a photo. Each
 * layout here is one of those, and every document comes with the answer key the reader is scored
 * against (corpus.ts) and what the build should make of it (score-build.ts).
 */

import ExcelJS from "exceljs";
import { escapeCsvField } from "../csv";
import type { CorpusKey, KeyLine } from "../corpus";
import type { Rng } from "./rng";
import { listedHandle, type Delivery, type DeliveryLine, type Model, type Shop } from "./world";

export interface ExpectedProduct {
  brand: string;
  /** The model's name, which the built title must carry. */
  name: string;
  gender: string;
  type: string;
  /** How many variants the delivery has of it. */
  variants: number;
  /** Each option's values among those variants. */
  options: Record<string, string[]>;
  /** Where the shop already lists this model (same season): the handle the lines should be placed on. */
  reorderHandle?: string;
}

export interface BuildExpectation {
  products: ExpectedProduct[];
}

export interface SimDocument {
  layout: string;
  filename: string;
  mime: string;
  data: Buffer;
  /** The brands on it, for the mapping's fixed brand where the file does not say. */
  brands: string[];
  key: CorpusKey;
  expect: BuildExpectation;
  /** Read by the model, not by code: needs a key, and costs a little. */
  needsAi: boolean;
}

export interface Layout {
  id: string;
  needsAi: boolean;
  /** Which kinds of delivery it can render: a grid needs a sizing option. */
  fits: (d: Delivery) => boolean;
  render: (d: Delivery, shop: Shop, rng: Rng) => Promise<SimDocument> | SimDocument;
}

const SIZE_LIKE = ["Size", "Length", "Capacity"];
const sizeOf = (l: DeliveryLine): string => SIZE_LIKE.map((k) => l.variant.options[k]).find(Boolean) ?? "";
const colourOf = (l: DeliveryLine): string => l.variant.options.Colour ?? "";
const otherOf = (l: DeliveryLine): string => Object.entries(l.variant.options).filter(([k]) => k !== "Colour" && !SIZE_LIKE.includes(k)).map(([, v]) => v)[0] ?? "";
const money = (n: number): string => n.toFixed(2);
const genderWord = (m: Model): string => (m.gender === "Men's" ? "Mens" : m.gender === "Women's" ? "Womens" : "");
/** The name as a supplier prints it: who it is for in front, where it is for someone. */
const printedName = (m: Model): string => [genderWord(m), m.name].filter(Boolean).join(" ");

/** Which code a layout carries per line: the variant's own, its barcode, or (a grid) the model's. */
type CodeOn = "sku" | "barcode" | "model";

function keyLine(l: DeliveryLine, code: CodeOn = "sku"): KeyLine {
  const k: KeyLine = { code: code === "sku" ? l.variant.sku : code === "barcode" ? l.variant.barcode : l.model.code, name: l.model.name, quantity: l.quantity, cost: l.variant.cost, rrp: l.variant.rrp };
  if (sizeOf(l)) k.size = sizeOf(l);
  if (colourOf(l)) k.colour = colourOf(l);
  if (otherOf(l)) k.option = otherOf(l);
  return k;
}

function keyOf(d: Delivery, trade: string, kind: string, code: CodeOn = "sku", withTotals = true): CorpusKey {
  const units = d.lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = Math.round(d.lines.reduce((n, l) => n + l.quantity * l.variant.cost, 0) * 100) / 100;
  return { trade, kind, lines: d.lines.map((l) => keyLine(l, code)), ...(withTotals ? { totals: { units, subtotal } } : {}) };
}

/** What the build should make of the delivery: a product per model (per gender), its variants, its options. */
export function expectationOf(d: Delivery, shop: Shop): BuildExpectation {
  const byModel = new Map<Model, DeliveryLine[]>();
  for (const l of d.lines) byModel.set(l.model, [...(byModel.get(l.model) ?? []), l]);
  const listedCodes = new Map(shop.listed.map((m) => [`${m.brand}|${m.gender}|${m.name}|${m.season}`, m]));
  return {
    products: [...byModel.entries()].map(([m, lines]) => {
      const options: Record<string, string[]> = {};
      for (const l of lines) for (const [k, v] of Object.entries(l.variant.options)) options[k] = [...new Set([...(options[k] ?? []), v])];
      const listed = listedCodes.get(`${m.brand}|${m.gender}|${m.name}|${m.season}`);
      return { brand: m.brand, name: m.name, gender: m.gender, type: m.kind.type, variants: lines.length, options, ...(listed ? { reorderHandle: listedHandle(listed) } : {}) };
    }),
  };
}

const csvOf = (rows: Array<Array<string | number>>): Buffer => Buffer.from(rows.map((r) => r.map((c) => escapeCsvField(c)).join(",")).join("\r\n") + "\r\n", "utf8");
const fileStem = (d: Delivery): string => `${d.suppliers.map((s) => s.brand).join("-").replace(/\s+/g, "")}-${d.invoiceNumber}`;
const hasGender = (d: Delivery): boolean => d.lines.some((l) => l.model.gender);
const sizing = (d: Delivery): boolean => d.lines.every((l) => l.variant.options.Size !== undefined || l.variant.options.Length !== undefined);

/** Three vocabularies a flat, one-row-per-item file comes in. */
const FLAT_VOCAB = [
  { code: "Part No", name: "Description", colour: "Colour", size: "Size", gender: "Gender", qty: "Qty", cost: "Dealer Price", rrp: "MSRP" },
  { code: "SKU", name: "Item", colour: "Color", size: "Size", gender: "Gender", qty: "Quantity", cost: "Unit Price", rrp: "RRP" },
  { code: "Item Code", name: "Product Description", colour: "Colour Name", size: "Size Desc", gender: "Gender Description", qty: "Units", cost: "Wholesale", rrp: "Retail Price", category: "Product Group" },
] as const;

function flatRows(d: Delivery, v: (typeof FLAT_VOCAB)[number] & { category?: string }, extra: { barcode?: boolean; brand?: boolean } = {}): Array<Array<string | number>> {
  const sized = d.lines.some(sizeOf);
  const coloured = d.lines.some(colourOf);
  const other = d.lines.some(otherOf);
  const gendered = hasGender(d);
  const otherName = other ? Object.keys(d.lines.find(otherOf)!.variant.options).find((k) => k !== "Colour" && !SIZE_LIKE.includes(k)) ?? "Option" : "";
  // An ERP's export says what each line is, in the supplier's own words: a product group column.
  const head = [...(extra.brand ? ["Brand"] : []), ...(extra.barcode ? ["Barcode"] : []), v.code, ...(v.category ? [v.category] : []), v.name, ...(gendered ? [v.gender] : []), ...(coloured ? [v.colour] : []), ...(sized ? [v.size] : []), ...(other ? [otherName] : []), v.qty, v.cost, v.rrp];
  const rows = d.lines.map((l) => [...(extra.brand ? [l.model.brand] : []), ...(extra.barcode ? [l.variant.barcode] : []), l.variant.sku, ...(v.category ? [l.model.kind.type.toUpperCase()] : []), l.model.name, ...(gendered ? [genderWord(l.model)] : []), ...(coloured ? [colourOf(l)] : []), ...(sized ? [sizeOf(l)] : []), ...(other ? [otherOf(l)] : []), l.quantity, money(l.variant.cost), money(l.variant.rrp)]);
  return [head, ...rows];
}

/** One row per model and colour, the sizes across the top, a quantity in the box ordered. */
function gridRows(d: Delivery, head: { code: string; name: string; colour: string; cost: string; rrp: string; total: string }, order: "sizes-last" | "sizes-first" = "sizes-last"): Array<Array<string | number>> {
  const sizes = [...new Set(d.lines.flatMap((l) => l.model.variants.map((x) => x.options.Size ?? x.options.Length ?? "")))].filter(Boolean);
  const byRow = new Map<string, DeliveryLine[]>();
  for (const l of d.lines) { const k = `${l.model.code}|${colourOf(l)}`; byRow.set(k, [...(byRow.get(k) ?? []), l]); }
  const coloured = d.lines.some(colourOf);
  const own = (l: DeliveryLine) => [l.model.code, printedName(l.model), ...(coloured ? [colourOf(l)] : []), money(l.variant.cost), money(l.variant.rrp)];
  const ownHead = [head.code, head.name, ...(coloured ? [head.colour] : []), head.cost, head.rrp];
  const rows = [...byRow.values()].map((lines) => {
    const cells = sizes.map((s) => { const hit = lines.find((l) => sizeOf(l) === s); return hit ? hit.quantity : ""; });
    const total = lines.reduce((n, l) => n + l.quantity, 0);
    return order === "sizes-last" ? [...own(lines[0]), ...cells, total] : [...own(lines[0]).slice(0, -2), total, ...cells, ...own(lines[0]).slice(-2)];
  });
  const headRow = order === "sizes-last" ? [...ownHead, ...sizes, head.total] : [...ownHead.slice(0, -2), head.total, ...sizes, ...ownHead.slice(-2)];
  return [headRow, ...rows];
}

async function xlsxOf(sheets: Array<{ name: string; rows: Array<Array<string | number>> }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) { const ws = wb.addWorksheet(s.name); for (const r of s.rows) ws.addRow(r); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The letterhead a supplier's workbook or page starts with, and the totals it ends with. */
function letterhead(d: Delivery): Array<Array<string | number>> {
  return [[`${d.suppliers[0].brand} Australia Pty Ltd`], [`TAX INVOICE ${d.invoiceNumber}`, "", `Date: ${d.date}`], ["Prices AUD, ex GST"], []];
}
function footer(d: Delivery): Array<Array<string | number>> {
  const sub = d.lines.reduce((n, l) => n + l.quantity * l.variant.cost, 0);
  return [[], ["", "", "", "Subtotal", money(sub)], ["", "", "", "Freight", money(d.freight)], ["", "", "", "GST", money((sub + d.freight) * 0.1)], ["", "", "", "Total", money((sub + d.freight) * 1.1)]];
}

/** A printed page: columns of text, as a PDF's text comes out or a person types it. */
function pageText(d: Delivery): string {
  const sized = d.lines.some(sizeOf);
  const coloured = d.lines.some(colourOf);
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const lines = [
    `${d.suppliers[0].brand.toUpperCase()} AUSTRALIA PTY LTD`,
    `TAX INVOICE ${d.invoiceNumber}        Date ${d.date}`,
    `Bill to: ${"Customer"}             Prices AUD ex GST`,
    "",
    `${pad("Code", 18)}${pad("Description", 38)}${coloured ? pad("Colour", 14) : ""}${sized ? pad("Size", 8) : ""}${pad("Qty", 5)}${pad("Unit", 10)}${pad("RRP", 10)}Amount`,
    "-".repeat(110),
    ...d.lines.map((l) => `${pad(l.variant.sku, 18)}${pad(printedName(l.model), 38)}${coloured ? pad(colourOf(l), 14) : ""}${sized ? pad(sizeOf(l), 8) : ""}${pad(l.quantity, 5)}${pad(money(l.variant.cost), 10)}${pad(money(l.variant.rrp), 10)}${money(l.quantity * l.variant.cost)}`),
    "-".repeat(110),
    ...footer(d).slice(1).map((r) => `${" ".repeat(80)}${pad(r[3], 10)}${r[4]}`),
  ];
  return lines.join("\n") + "\n";
}

/** A single-font PDF of a page of text, one text object per line. The same writer as samples/generate-fixtures.ts. */
export function textToPdf(text: string): Buffer {
  const lines = text.split("\n");
  const esc = (l: string) => l.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = lines.map((l, i) => `BT /F1 8 Tf 30 ${810 - i * 12} Td (${esc(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A photo of the page: the text drawn on a slightly off-white sheet, as a phone would see it. */
async function pagePhoto(text: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${120 + lines.length * 26}">
    <rect width="100%" height="100%" fill="#f7f4ee"/>
    ${lines.map((l, i) => `<text x="40" y="${60 + i * 26}" font-family="DejaVu Sans Mono, Courier New, monospace" font-size="17" fill="#222" xml:space="preserve">${esc(l)}</text>`).join("\n")}
  </svg>`;
  return sharp(Buffer.from(svg)).rotate(0.6, { background: "#e9e4da" }).jpeg({ quality: 82 }).toBuffer();
}

const doc = (layout: string, d: Delivery, shop: Shop, filename: string, mime: string, data: Buffer, key: CorpusKey, needsAi = false): SimDocument => ({
  layout, filename, mime, data, brands: d.suppliers.map((s) => s.brand), key, expect: expectationOf(d, shop), needsAi,
});

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const LAYOUTS: Layout[] = [
  { id: "flat-csv-a", needsAi: false, fits: () => true, render: (d, shop) => doc("flat-csv-a", d, shop, `${fileStem(d)}.csv`, "text/csv", csvOf(flatRows(d, FLAT_VOCAB[0])), keyOf(d, shop.trade.id, "csv")) },
  { id: "flat-csv-b", needsAi: false, fits: () => true, render: (d, shop) => doc("flat-csv-b", d, shop, `${fileStem(d)}-order.csv`, "text/csv", csvOf(flatRows(d, FLAT_VOCAB[1])), keyOf(d, shop.trade.id, "csv")) },
  { id: "flat-csv-sap", needsAi: false, fits: () => true, render: (d, shop) => doc("flat-csv-sap", d, shop, `${fileStem(d)}-export.csv`, "text/csv", csvOf(flatRows(d, FLAT_VOCAB[2])), keyOf(d, shop.trade.id, "csv")) },
  { id: "barcode-csv", needsAi: false, fits: () => true, render: (d, shop) => doc("barcode-csv", d, shop, `${fileStem(d)}-barcodes.csv`, "text/csv", csvOf(flatRows(d, FLAT_VOCAB[1], { barcode: true })), keyOf(d, shop.trade.id, "csv", "barcode")) },
  { id: "size-grid-csv", needsAi: false, fits: sizing, render: (d, shop) => doc("size-grid-csv", d, shop, `${fileStem(d)}-grid.csv`, "text/csv", csvOf(gridRows(d, { code: "Style #", name: "Style Name", colour: "Colour", cost: "Wholesale", rrp: "RRP", total: "Total" })), keyOf(d, shop.trade.id, "grid", "model")) },
  {
    id: "xlsx-letterhead", needsAi: false, fits: () => true,
    render: async (d, shop) => doc("xlsx-letterhead", d, shop, `${fileStem(d)}.xlsx`, XLSX, await xlsxOf([{ name: "Invoice", rows: [...letterhead(d), ...flatRows(d, FLAT_VOCAB[1]), ...footer(d)] }]), keyOf(d, shop.trade.id, "xlsx")),
  },
  {
    id: "xlsx-grid-sections", needsAi: false, fits: sizing,
    // A section per kind of product, each under its own heading row, the sizes before the prices.
    render: async (d, shop) => {
      const byKind = new Map<string, DeliveryLine[]>();
      for (const l of d.lines) byKind.set(l.model.kind.type, [...(byKind.get(l.model.kind.type) ?? []), l]);
      const rows: Array<Array<string | number>> = [[`${d.suppliers[0].brand} order form 2027`], []];
      for (const [kind, lines] of byKind) {
        rows.push([kind.toUpperCase()]);
        rows.push(...gridRows({ ...d, lines }, { code: "Item No.", name: kind, colour: "Colour", cost: "W/S", rrp: "RRP", total: "TOTAL QTY" }, "sizes-first"));
        rows.push([]);
      }
      return doc("xlsx-grid-sections", d, shop, `${fileStem(d)}-order-form.xlsx`, XLSX, await xlsxOf([{ name: `${d.suppliers[0].brand} 2027`, rows }]), keyOf(d, shop.trade.id, "grid", "model", false));
    },
  },
  {
    id: "price-list-order", needsAi: false, fits: sizing,
    // The supplier's whole range, priced; the order is the few boxes with a quantity in them.
    render: async (d, shop) => {
      const supplier = d.suppliers[0];
      const ordered = new Set(d.lines.map((l) => l.model));
      const every: DeliveryLine[] = supplier.range.flatMap((m) => (ordered.has(m) ? d.lines.filter((l) => l.model === m) : m.variants.slice(0, 1).map((variant) => ({ model: m, variant, quantity: 0 }))));
      const rows = gridRows({ ...d, lines: every }, { code: "Item No.", name: "Model", colour: "Colour", cost: "W/S", rrp: "RRP", total: "Qty" }, "sizes-first").map((r) => r.map((c) => (c === 0 ? "" : c)));
      return doc("price-list-order", d, shop, `${fileStem(d)}-price-list.xlsx`, XLSX, await xlsxOf([{ name: "Range 2027", rows: [[`${supplier.brand} RETAIL 2027 ORDER`], ["Indent orders by 25 October"], [], ...rows] }]), keyOf(d, shop.trade.id, "grid", "model", false));
    },
  },
  { id: "multi-brand-csv", needsAi: false, fits: (d) => d.suppliers.length > 1, render: (d, shop) => doc("multi-brand-csv", d, shop, `Distributor-${d.invoiceNumber}.csv`, "text/csv", csvOf(flatRows(d, FLAT_VOCAB[0], { brand: true, barcode: true })), keyOf(d, shop.trade.id, "multi-brand")) },
  { id: "text-page", needsAi: true, fits: () => true, render: (d, shop) => doc("text-page", d, shop, `${fileStem(d)}.txt`, "text/plain", Buffer.from(pageText(d), "utf8"), keyOf(d, shop.trade.id, "pdf-text"), true) },
  { id: "pdf-page", needsAi: true, fits: () => true, render: (d, shop) => doc("pdf-page", d, shop, `${fileStem(d)}.pdf`, "application/pdf", textToPdf(pageText(d)), keyOf(d, shop.trade.id, "pdf-text"), true) },
  { id: "photo-page", needsAi: true, fits: () => true, render: async (d, shop) => doc("photo-page", d, shop, `${fileStem(d)}.jpg`, "image/jpeg", await pagePhoto(pageText(d)), keyOf(d, shop.trade.id, "photo"), true) },
];

export const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
