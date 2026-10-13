/**
 * A supplier's invoice read for the bookkeeping: who, when, how much, how much of it GST.
 *
 * The invoice reader in extract/ai.ts reads an invoice for the SHOP — what was ordered, at what
 * cost, to list. This reads the same page for the BOOKS: the supplier's name as they print it,
 * the invoice number, the dates and the terms, the goods, the freight, the GST and the total, and
 * each printed line's amount. Nothing is listed from it; it becomes a bill in QuickBooks.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXTRACTION_MODEL, aiAvailable } from "../extract/ai";
import { retrying } from "../api-errors";
import type { Bill } from "./quickbooks";

const LineSchema = z.object({
  description: z.string().describe("The line as printed: the item's name, with its code and size where printed. For a grouped line, the item's name with the count, e.g. \"Custom Camber (6)\"."),
  quantity: z.number().nullable().describe("The quantity on the line. Null where none."),
  unitPrice: z.number().nullable().describe("The unit price actually charged, after any discount shown on the line, before GST. Null where none."),
  amount: z.number().nullable().describe("The line's total as printed, before GST. Null where none."),
  gst: z.number().nullable().describe("The GST printed against this line, where the invoice prints it per line. Null otherwise."),
  kind: z.enum(["goods", "freight", "other"]).describe("goods for products; freight for freight, shipping or delivery; other for anything else charged, such as a deposit or a fee."),
});

const BillSchema = z.object({
  supplier: z.string().describe("The supplier's name as printed on the invoice, in full — the company that issued it, e.g. \"Burton Snowboards Australia Pty Ltd\". Empty if none."),
  billNo: z.string().describe("The invoice number as printed. Empty if none."),
  billDate: z.string().describe("The invoice date as YYYY-MM-DD. An Australian invoice writes day before month: 03/09/2026 is 3 September. Empty if none."),
  dueDate: z.string().describe("The due date as YYYY-MM-DD where printed. Empty otherwise."),
  terms: z.string().describe("The payment terms as printed: \"30 days\", \"Net 60\", \"Due on receipt\". Empty if none."),
  currency: z.string().describe("The currency as a code: AUD, USD, EUR, NZD. AUD where the invoice is Australian and says nothing."),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE", "UNKNOWN"]).describe("EXCLUSIVE when prices are before GST and GST is added at the end (the usual wholesale invoice); INCLUSIVE when prices include GST; NONE when no GST applies — an overseas supplier, or GST shown as 0; UNKNOWN otherwise."),
  memo: z.string().describe("What the invoice is for, in a few words for the books: \"Winter 27 snowboards, first delivery\", \"Head boots closeout\". Empty if nothing says."),
  lines: z.array(LineSchema).describe("The printed lines. Where there are more than forty, group them by product — the same name across sizes and colours as one line, with the quantity and amount summed — so there are at most forty. Never leave a charged amount out."),
  subtotal: z.number().nullable().describe("The total of the goods before GST and before freight, as printed. Null if not printed."),
  freight: z.number().nullable().describe("Freight, shipping or delivery charged, before GST. Null if none."),
  gst: z.number().nullable().describe("The GST as printed. Null if not printed."),
  total: z.number().nullable().describe("The amount payable as printed. Null if not printed."),
  unsure: z.array(z.string()).describe("Figures that could be read two ways, each as \"field: the reading given, or the other\". Empty when every figure is plain."),
  startsInvoice: z.boolean().describe("When reading a single page out of a scanned batch: true where this page is the FIRST page of an invoice — the letterhead with the invoice number, date and the start of the lines, or \"Page 1 of N\". False for a page that carries on an invoice from the page before. True when the whole invoice is given."),
  printedPage: z.number().nullable().describe("The page number printed on the page, as in \"Page 2 of 3\" → 2. Null if none is printed."),
  printedPages: z.number().nullable().describe("The page count printed on the page, as in \"Page 2 of 3\" → 3. Null if none is printed."),
});

export type BillReading = z.infer<typeof BillSchema>;

/** Where one page of a scanned batch sits in its invoice, as the page itself says. */
export interface PageMark {
  startsInvoice: boolean;
  printedPage: number | null;
  printedPages: number | null;
}

const SYSTEM = `You read a supplier's invoice for the bookkeeper of a ski and snowboard shop in Australia, so it can be entered as a bill in QuickBooks.

Rules:
- The supplier is the company that issued the invoice, as printed in full on the letterhead. Not the shop, which is the customer.
- Copy the invoice number as printed. Dates as YYYY-MM-DD; an Australian invoice writes the day before the month.
- Amounts are the figures printed. Unit prices and line amounts are before GST on a wholesale invoice; GST is printed near the total. Never invent a figure; a figure that is not printed is null.
- The subtotal is the goods before freight and GST. Freight, shipping or delivery is its own figure. The total is the amount payable.
- A discount shown on a line is already in the unit price actually charged and in the line's amount. A discount line at the end that reduces the goods is a line of kind "other" with a negative amount.
- An order confirmation, a packing list or a quote is not an invoice; read it the same way, and say so in unsure as "document: order confirmation, not an invoice".`;

let client: Anthropic | null = null;
const getClient = (): Anthropic => (client ??= new Anthropic({ maxRetries: 2 }));
const LOOK_MS = 240_000;

export type BillPage =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: Buffer }
  | { kind: "pdf"; data: Buffer }
  | { kind: "text"; text: string };
export type BillAsker = (system: string, content: Anthropic.MessageParam["content"]) => Promise<string | undefined>;

const askModel: BillAsker = async (system, content) => {
  const response = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 12_000,
    system,
    output_config: { format: zodOutputFormat(BillSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  }, { timeout: LOOK_MS, maxRetries: 2, signal: AbortSignal.timeout(LOOK_MS) }).finalMessage(), [3_000]);
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

/** A spreadsheet's rows as text the reader can read, trimmed to what fits. */
export function gridAsText(name: string, grid: string[][], limit = 400): string {
  const rows = grid.filter((r) => r.some((c) => c.trim())).slice(0, limit);
  return `Sheet "${name}", one row per line, cells separated by tabs:\n${rows.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()).join("\t")).join("\n")}`;
}

/** The invoice's pages read as one bill. */
export async function readBill(pages: BillPage[], source: string, deps: { ask?: BillAsker } = {}): Promise<Bill> {
  return (await readBillMarked(pages, source, deps)).bill;
}

/**
 * One page of a scanned batch read on its own, with what it says about where it sits — the first
 * page of an invoice, or one carrying on from the page before. `groupPages` puts the pages back
 * together as invoices.
 */
export async function readBillPage(page: BillPage, source: string, deps: { ask?: BillAsker } = {}): Promise<{ bill: Bill; mark: PageMark }> {
  return readBillMarked([page], source, deps, "This is ONE page out of a scanned batch of several suppliers' invoices. Read what is on this page alone, and say whether it starts an invoice or carries one on.");
}

async function readBillMarked(pages: BillPage[], source: string, deps: { ask?: BillAsker }, ask = "Read this invoice as a bill for the books."): Promise<{ bill: Bill; mark: PageMark }> {
  if (pages.length === 0) throw new Error("No pages to read.");
  if (!deps.ask && !aiAvailable()) throw new Error("No API key is set, so the invoice cannot be read. Add ANTHROPIC_API_KEY in Settings.");
  const content: Anthropic.MessageParam["content"] = [];
  pages.forEach((p, i) => {
    if (pages.length > 1) content.push({ type: "text", text: `Page ${i + 1} of ${pages.length}:` });
    if (p.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data.toString("base64") } });
    else if (p.kind === "image") content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data.toString("base64") } });
    else content.push({ type: "text", text: p.text });
  });
  content.push({ type: "text", text: ask });
  const text = await (deps.ask ?? askModel)(SYSTEM, content);
  if (!text) throw new Error("The reader gave no answer for the invoice.");
  const read = BillSchema.parse(JSON.parse(text));
  return { bill: asBill(read, source), mark: { startsInvoice: read.startsInvoice, printedPage: read.printedPage, printedPages: read.printedPages } };
}

/** The reading as a bill on the page, with what is obviously derivable filled in. */
export function asBill(read: Omit<BillReading, keyof PageMark>, source: string): Bill {
  const lines = read.lines.map((l) => ({ ...l, description: l.description.trim() }));
  const freightLines = lines.filter((l) => l.kind === "freight");
  const freight = read.freight ?? (freightLines.length ? freightLines.reduce((n, l) => n + (l.amount ?? 0), 0) : null);
  return {
    source,
    supplier: read.supplier.trim(),
    billNo: read.billNo.trim(),
    billDate: read.billDate.trim(),
    dueDate: read.dueDate.trim(),
    terms: read.terms.trim(),
    currency: read.currency.trim().toUpperCase() || "AUD",
    gstTreatment: read.gstTreatment,
    memo: read.memo.trim(),
    lines,
    subtotal: read.subtotal,
    freight,
    gst: read.gst,
    total: read.total,
    unsure: read.unsure,
  };
}
