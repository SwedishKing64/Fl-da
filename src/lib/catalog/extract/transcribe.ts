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
import { isOwnShop, retailer, shopProfile } from "../shop-profile";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { retrying } from "../api-errors";
import { TranscriptSchema, type Transcript } from "./transcript";

export { CSV_COLUMNS, brandOf, csvCells, csvNameFor, transcriptToCsv, unitCostOf, type Transcript, type TranscriptRow } from "./transcript";



const SYSTEM = () => `You transcribe a supplier's order confirmation, invoice or packing list for ${retailer()}. The document is often a photo of a printed page that the shop's staff have written on in pen, and both the print and the pen matter.

Rules:
- The supplier is who the document is FROM: the company whose logo, letterhead or "remit to" it carries. The shop itself${shopProfile().name.trim() ? ` (${shopProfile().name.trim()})` : ""} is the buyer, printed as bill to, ship to or sold to, and is never the supplier.
- Transcribe every printed line. Copy codes, names, colours, sizes, quantities and prices exactly as printed; do not round, tidy or rename.
- A line printed with several sizes or lengths is one row per size, each with its own quantity. A size is whatever the line is sold in: a length, a clothing or shoe size (US 9.5), a pack size (S/M), a capacity or volume (2P, 65L).
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
  const text = await (deps.ask ?? askModel)(SYSTEM(), content);
  if (!text) throw new Error("The reader gave no answer for the document.");
  const transcript = TranscriptSchema.parse(JSON.parse(text));
  // The shop is the buyer on its own paperwork: its name read as the supplier would become the
  // brand of every line (see transcriptToCsv).
  return isOwnShop(transcript.supplier) ? { ...transcript, supplier: "" } : transcript;
}
