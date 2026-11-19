/**
 * A transcribed document's shape and its CSV: what the Tidy page shows and saves in the browser.
 * Kept apart from the reading itself (transcribe.ts), which needs the server — the shop's profile,
 * the model — so a page in the browser can use these without pulling the server in with them.
 */

import { z } from "zod";
import { escapeCsvField } from "../csv";

export const RowSchema = z.object({
  sku: z.string().describe("The supplier's code for the line's main item: the material number, style number or SKU as printed. Empty if none."),
  bindingSku: z.string().describe("Where a binding line is paired with the ski above it into one package: the binding's code. Empty otherwise."),
  description: z.string().describe("The item as printed. For a package: the ski's printed name, then \" inc \", the binding's printed name, then \" Binding Package\"."),
  colour: z.string().describe("The colour as printed, often a code like \"wh/bk\". Empty if none."),
  size: z.string().describe("The length or size this row is for. A line printed with several sizes is several rows, one per size, each with its own quantity."),
  quantity: z.number().nullable().describe("The printed quantity for this size. Null where none."),
  unitPrice: z.number().nullable().describe("The printed unit price of the main item, before any discount. Null where none."),
  bindingUnitPrice: z.number().nullable().describe("The printed unit price of the paired binding, before any discount. Null where there is no binding."),
  discountPercent: z.number().nullable().describe("A discount written or printed against this line, as a percentage: 20 for \"20%\". Null where none."),
  rrp: z.number().nullable().describe("A recommended retail price for this row: a printed RRP column, or a three-or-four-digit amount handwritten beside the line — beside a package it is the package's. Null where none."),
  season: z.string().describe("A season written or printed against the line, as four digits where it reads as a year: \"26\" is 2026. \"2998\" or \"2999\" is the shop's own tag for a closeout and is copied as written. Empty where none."),
  gender: z.string().describe("Mens, Womens, Kids or Unisex where the item's name or a note says; empty otherwise."),
  notes: z.string().describe("Every other handwritten remark against this line, in plain words: \"QTY if it exists\", \"should be 148cm\", \"+ SLR 10 binding\". Empty where none."),
  unsure: z.array(z.string()).describe("Readings that could go another way, each as \"field: the reading given, or the other\": \"rrp: 1099, or 1699\". Empty when every reading is plain."),
});

export const TranscriptSchema = z.object({
  supplier: z.string().describe("Who the document is from, as printed."),
  reference: z.string().describe("The order, invoice or confirmation number as printed. Empty if none."),
  date: z.string().describe("The document's date as printed. Empty if none."),
  remarks: z.string().describe("Handwriting that is about the whole document rather than a line, in plain words: \"Head closeout skis and boots arriving 10/10/26\". Empty if none."),
  rows: z.array(RowSchema),
});

export type TranscriptRow = z.infer<typeof RowSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

/** The columns of the CSV, in the order the bulk page's invoice reader likes them. */
export const CSV_COLUMNS = ["SKU", "Binding SKU", "Brand", "Description", "Colour", "Size", "Quantity", "Unit Price", "Binding Unit Price", "Discount %", "Unit Cost", "RRP", "Season", "Gender", "Notes"] as const;

const money = (n: number | null): string => (n === null || !Number.isFinite(n) ? "" : n.toFixed(2));

/** The cost of one of this row: the printed prices less the discount, as the shop would work it out. */
export function unitCostOf(row: Pick<TranscriptRow, "unitPrice" | "bindingUnitPrice" | "discountPercent">): number | null {
  if (row.unitPrice === null) return null;
  const gross = row.unitPrice + (row.bindingUnitPrice ?? 0);
  const off = row.discountPercent ?? 0;
  return Math.round(gross * (1 - off / 100) * 100) / 100;
}

/** One row as the CSV's cells, in CSV_COLUMNS order. */
export function csvCells(row: TranscriptRow, brand: string): string[] {
  return [
    row.sku, row.bindingSku, brand, row.description, row.colour, row.size,
    row.quantity === null ? "" : String(row.quantity),
    money(row.unitPrice), money(row.bindingUnitPrice),
    row.discountPercent === null ? "" : String(row.discountPercent),
    money(unitCostOf(row)), money(row.rrp), row.season, row.gender,
    [row.notes, ...row.unsure.map((u) => `Check: ${u}`)].filter(Boolean).join("; "),
  ];
}

/** The whole transcript as a CSV the bulk page reads as an invoice. */
export function transcriptToCsv(t: Transcript, brand = brandOf(t.supplier)): string {
  const lines = [CSV_COLUMNS.join(","), ...t.rows.map((r) => csvCells(r, brand).map(escapeCsvField).join(","))];
  return lines.join("\n") + "\n";
}

/** The brand a supplier's paperwork is for: "Head Oceania Pty Limited" sells Head. */
export function brandOf(supplier: string): string {
  const first = supplier.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[^A-Za-z0-9[\]]/g, "");
}

/** A name for the file: the supplier and the reference, or the date. */
export function csvNameFor(t: Transcript): string {
  const parts = [brandOf(t.supplier) || "document", t.reference || t.date || "transcribed"].map((p) => p.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""));
  return `${parts.filter(Boolean).join("-")}.csv`;
}
