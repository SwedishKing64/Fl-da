/**
 * A supplier's paperwork, scribbled on, made into a table the rest of this app can read.
 *
 * What arrives from a rep is a printed order confirmation with the shop's own decisions written
 * over it in pen: the package price in the margin, a discount, a season, "QTY if it exists",
 * "should be 148cm", "+ SLR 10 bindy". The invoice reader wants a clean table and gets a photo.
 * This reads the photo as a person would: every printed line transcribed, the ski and the binding
 * beneath it made one package where the pen brackets them or prices them together, and each
 * scribble attached to the line it sits beside and put into words.
 *
 * Nothing here decides anything for the shop. A number that could be read two ways is given with
 * the other reading, and a remark that is not a price, a discount or a season is carried as a
 * note, for the person to act on.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, READING_MODEL, aiAvailable } from "../anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { retrying } from "../api-errors";
import { escapeCsvField } from "../csv";

const RowSchema = z.object({
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

const TranscriptSchema = z.object({
  supplier: z.string().describe("Who the document is from, as printed."),
  reference: z.string().describe("The order, invoice or confirmation number as printed. Empty if none."),
  date: z.string().describe("The document's date as printed. Empty if none."),
  remarks: z.string().describe("Handwriting that is about the whole document rather than a line, in plain words: \"Head closeout skis and boots arriving 10/10/26\". Empty if none."),
  rows: z.array(RowSchema),
});

export type TranscriptRow = z.infer<typeof RowSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

const SYSTEM = `You transcribe a supplier's order confirmation, invoice or packing list for a ski and snowboard shop in Australia. The document is often a photo of a printed page that the shop's staff have written on in pen, and both the print and the pen matter.

Rules:
- Transcribe every printed line. Copy codes, names, colours, sizes, quantities and prices exactly as printed; do not round, tidy or rename.
- A line printed with several sizes or lengths is one row per size, each with its own quantity.
- Skis and bindings: where a binding line sits directly under a ski line and the pen brackets them, prices them together, or writes one retail against the pair, they are ONE package: one row, the ski's code in sku, the binding's in bindingSku, the description as the ski's printed name then " inc " then the binding's printed name then " Binding Package", the ski's price in unitPrice and the binding's in bindingUnitPrice. A binding on its own stays its own row.
- Handwriting: a three-or-four-digit amount beside a line or a bracketed pair is the recommended retail (rrp) of that line or package. A percentage is the discount. Two or four digits that read as a year (26, 27, 2026, 2027) are the season; "2998" and "2999" are the shop's own closeout tags and are copied as written. Anything else written against a line goes into notes in plain words. Handwriting about the whole page goes into remarks.
- Where a handwritten figure could be read two ways, give the likelier in the field and put the other in unsure, as "rrp: 1099, or 1699".
- A quantity written in pen that replaces a printed one is the quantity. A line struck through in pen is still transcribed, with "struck out" in notes.
- Never invent a price, a code or a size that is not on the page.`;

const getClient = (): Anthropic => anthropicClient(2);
const LOOK_MS = 240_000;

export type Page = { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: Buffer } | { kind: "pdf"; data: Buffer };
export type Transcriber = (system: string, content: Anthropic.MessageParam["content"]) => Promise<string | undefined>;

const askModel: Transcriber = async (system, content) => {
  const response = await retrying(() => getClient().messages.stream({
    model: READING_MODEL,
    max_tokens: 16_000,
    system,
    output_config: { format: zodOutputFormat(TranscriptSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  }, { timeout: LOOK_MS, maxRetries: 2, signal: AbortSignal.timeout(LOOK_MS) }).finalMessage(), [3_000]);
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

/** The document's pages read into one table. The hint is what the person said the pen means. */
export async function transcribeDocument(pages: Page[], hint = "", deps: { ask?: Transcriber } = {}): Promise<Transcript> {
  if (pages.length === 0) throw new Error("No pages to read.");
  if (!deps.ask && !aiAvailable()) throw new Error("No API key is set, so the document cannot be read. Add ANTHROPIC_API_KEY in Settings.");
  const content: Anthropic.MessageParam["content"] = [];
  pages.forEach((p, i) => {
    if (pages.length > 1) content.push({ type: "text", text: `Page ${i + 1} of ${pages.length}:` });
    if (p.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data.toString("base64") } });
    else content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data.toString("base64") } });
  });
  content.push({ type: "text", text: `Transcribe this document into rows.${hint.trim() ? ` What the person says about the handwriting: ${hint.trim()}` : ""}` });
  const text = await (deps.ask ?? askModel)(SYSTEM, content);
  if (!text) throw new Error("The reader gave no answer for the document.");
  return TranscriptSchema.parse(JSON.parse(text));
}

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
