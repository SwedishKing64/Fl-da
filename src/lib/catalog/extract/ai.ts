// Claude-backed reading of uploaded files. One call classifies the document (invoice, spec
// sheet, price list, product photo…) and pulls out whatever is relevant for building Shopify
// products: purchasable line items for invoices, specs/descriptions for spec sheets, and what
// is visible in a product photo. Structured outputs keep the response schema-valid.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ExtractedTable } from "./types";
import { retrying } from "../api-errors";

export const EXTRACTION_MODEL = process.env.CATALOG_AI_MODEL || "claude-opus-5";

export type DocumentType = "INVOICE" | "SPEC_SHEET" | "PRICE_LIST" | "PRODUCT_PHOTO" | "OTHER";

const LineItemSchema = z.object({
  title: z.string().describe("Product name without size/length/colour suffixes, e.g. 'Bent 90'"),
  brand: z.string().describe("The brand ON the product — Volkl, Atomic, Marker. NEVER the distributor, agent or wholesaler the document came from."),
  modelCode: z.string().describe("Model/style code shared across sizes of the same product, else empty"),
  sku: z.string().describe("Supplier SKU / item code for this exact variant, else empty"),
  barcode: z.string().describe("EAN/UPC if present, digits only, else empty"),
  costPrice: z.number().nullable().describe("Unit cost price as a number, before any line total; null if the document has no cost (spec sheets, photos)"),
  currency: z.string().describe("ISO currency code if stated on the document, else empty"),
  quantity: z.number().nullable().describe("Units ordered/invoiced for this line; null when not an order"),
  rrp: z.number().nullable().describe("Recommended retail price if stated"),
  length: z.string().describe("Ski/snowboard length in cm, digits only, else empty"),
  size: z.string().describe("Boot size (mondopoint) or apparel size (S, M, L, XL, 8, 10, 12…), else empty. On a size-grid invoice this is the column header the quantity sat under."),
  width: z.string().describe("Boot last width in mm or ski waist width, else empty"),
  colour: z.string().describe("Colourway, else empty"),
  gender: z.string().describe("Mens/Womens/Unisex/Kids if stated, else empty"),
  season: z.string().describe("Season/model year like '2026' or 'FW25', else empty"),
  category: z.string().describe("One of: skis, snowboards, boots, bindings, poles, helmets, goggles, apparel, accessories, other"),
  description: z.string().describe("Marketing description and key features in plain prose, else empty"),
  flex: z.string().describe("Flex rating if stated"),
  abilityLevel: z.string().describe("Ability level if stated (Beginner/Intermediate/Advanced/Expert)"),
  dinRange: z.string().describe("Binding DIN range if stated, e.g. '4-13'"),
  terrain: z.string().describe("Terrain/use if stated, e.g. All-Mountain, Freeride, Park"),
  tags: z.string().describe("Comma-separated tags a shop would use, only where the document genuinely suggests one (e.g. 'Freeride, Twin Tip'). Never the supplier's own section headings or marketing phrases. Empty is a good answer."),
  imageUrls: z.array(z.string()).describe("Any image URLs printed for this line"),
});

const ExtractionSchema = z.object({
  documentType: z.enum(["INVOICE", "SPEC_SHEET", "PRICE_LIST", "PRODUCT_PHOTO", "OTHER"]).describe("What this document is"),
  summary: z.string().describe("One sentence on what the document contains and what was extracted"),
  supplier: z.string().describe("Supplier/company name issuing the document, else empty"),
  invoiceNumber: z.string().describe("Invoice / order confirmation number, else empty"),
  currency: z.string().describe("Document currency ISO code if determinable, else empty"),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE", "UNKNOWN"]).describe("How unit prices are expressed with respect to Australian GST"),
  items: z.array(LineItemSchema),
});

export type AiExtraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You read documents uploaded by a ski and snowboard retailer in Australia who is building Shopify products. Work out what each document is, then extract only what is relevant.

Document types:
- INVOICE / order confirmation: one item per purchasable variant line (each length/size/colour is its own item) with unit cost and quantity.
- PRICE_LIST / pre-book form: like an invoice but quantities may be absent; still one item per variant with the unit cost.
- SPEC_SHEET / catalogue page / workbook: one item per product (not per size) carrying brand, model, description, specs (flex, ability level, terrain, DIN, widths), the list of available lengths/sizes in the length/size field separated by commas, colourways, RRP if shown, and suggested tags. costPrice and quantity are null.
- PRODUCT_PHOTO: a photo of a product (skis, boots, apparel…). Return one item with the brand, model name, model code (if printed), colour and category you can see, everything else empty/null.
- OTHER: nothing useful; return no items.

Size grids (very common on apparel invoices, and the shape most often got wrong):
- Some invoices do not list one row per variant. Instead the sizes run ACROSS as column headers (S M L XL XXL XXXL, or 0 2 4 6 8 10 12 14 16 18 20, or 36 38 40 42) and each product row carries a quantity in the cell under each size it was ordered in. Empty cells were not ordered.
- When you see that, emit ONE ITEM PER SIZE THAT HAS A QUANTITY, not one item per row. Each item takes that size, that cell's quantity, and the row's name, code, colour and prices. A row with quantities under M and L is two items, not one.
- Quantities in those cells are often HANDWRITTEN, and may be circled or ticked. Read them as the quantity. A circle around a number does not change the number.
- Check your work against the row's printed total quantity ("2 EA", "3 EA") and the stated Total Units: the quantities you emit for a row should add up to it.
- A page may be photographed sideways or upside down. Read it in whatever orientation it is.

The brand is the brand on the product, never the company that sent the document:
- An order form, an invoice and a price list all carry a letterhead: a name, an address, a phone number, an email, usually top-right. That company is the DISTRIBUTOR — the agent this shop buys through. "Sportrade Australia" is who sells them Volkl; it is not the brand of a single ski, and it must never be the brand on an item.
- The brand is what is printed on the goods, and it is what the range is called: RACETIGER, BLAZE and MANTRA are Volkl; SQUIRE and GRIFFON are Marker. It is usually in the document's title, in a logo, in the sheet's name, or in the model codes — and it is the same for most or all of the rows.
- One workbook can hold two brands, most often a ski brand and the binding brand on the same order. Give each item the brand of the thing that item IS.
- If the document names no brand at all, leave it empty. An empty brand is fixed in one click on the batch; a distributor's name is fixed by someone noticing it first, and nobody does.

Section headers:
- A line like "Description: SPYD - Mens - Technical Jackets" or "Womens - Technical Pants" is a heading that applies to EVERY row beneath it until the next such heading, not a product of its own.
- Take the gender from it (Mens, Womens, Kids) and put it in the gender field of every item under it.
- Do not copy the heading's wording into tags. "Technical Jackets" is the supplier's own phrase for a section, not a tag this shop uses.

Prices — the most important thing on the document:
- When a row shows both an RRP column and a wholesale column (W/S, Price net, Your price, Cost), rrp is the RECOMMENDED RETAIL and costPrice is the WHOLESALE one. Getting these the wrong way round is the single most damaging mistake here, so read the column headings rather than assuming the larger number is either one.
- A wholesale invoice commonly runs: Qty | RRP | W/S (ex. GST) | Disc% | Price net (ex. GST) | Total (ex. GST). Read it as: rrp is the RRP column; costPrice is Price net, the unit amount actually charged after the discount; Total is the line total and is never a unit price. Disc% describes the wholesale side only — it is NOT a retail discount and it does not change the rrp.
- rrp is the single field this shop cannot do without: it is what the product sells for. If an RRP column exists, EVERY item you return from a row under it carries that row's rrp — including every size of the same colourway on a size grid. Do not put the price on the first size and leave the rest null.
- If the page is rotated or sideways, read it rotated. The column headings are on the same edge as the numbers and they say which column is which; never guess a column's meaning from the size of the numbers in it.
- If, having read the headings, no RRP is stated anywhere on the document, leave rrp null. Do not put the wholesale price there — it will be looked up on the brand's website instead, and a wholesale price written into rrp would be sold at.

Rules:
- title is the product name only; put length/size/colour in their own fields. Keep the brand out of the title when it is identifiable separately.
- modelCode is the code shared across sizes of the same product (style number); sku is the code unique to this variant. If only one code exists, put it in sku and derive modelCode by stripping the size/colour suffix when obvious, otherwise leave modelCode empty.
- costPrice is the UNIT price for one item, never the line total. Strip currency symbols.
- Never invent values. Leave a string empty or a number null when the document does not state it.
- Ignore freight, deposit, discount, subtotal and tax summary lines - they are not products.
- gstTreatment: EXCLUSIVE when prices are marked ex GST / plus GST, INCLUSIVE when marked inc GST, NONE when the supplier is overseas and no GST applies, otherwise UNKNOWN.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 6 }); // see getClient in adjust-plan.ts: two retries does not ride out "overloaded"
  return client;
}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

type ContentBlocks = Anthropic.MessageParam["content"];

async function runExtraction(content: ContentBlocks): Promise<AiExtraction> {
  const message = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 64000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(ExtractionSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  }).finalMessage());
  if (message.stop_reason === "refusal") throw new Error("The AI declined to process this document");
  if (message.stop_reason === "max_tokens") throw new Error("Document too large for a single extraction; split the file");
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  return ExtractionSchema.parse(JSON.parse(text));
}

function hintFor(kind?: string): string {
  switch (kind) {
    case "INVOICE": return "The user says this is an invoice or order confirmation.";
    case "SPEC_SHEET": return "The user says this is a spec sheet or catalogue page: extract products with their specs, descriptions and available sizes.";
    case "PRODUCT_PHOTO": return "The user says this is a product photo: identify the product only.";
    default: return "Decide what kind of document this is first.";
  }
}

export async function extractFromText(text: string, kind?: string): Promise<AiExtraction> {
  return runExtraction([{ type: "text", text: `${hintFor(kind)} Extract what is relevant from this document:\n\n<document>\n${text}\n</document>` }]);
}

export async function extractFromPdf(buffer: Buffer, kind?: string): Promise<AiExtraction> {
  return runExtraction([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    { type: "text", text: `${hintFor(kind)} Extract what is relevant from this document.` },
  ]);
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function extractFromImage(buffer: Buffer, mimeType: string, kind?: string): Promise<AiExtraction> {
  if (!IMAGE_TYPES.has(mimeType)) throw new Error(`Unsupported image type ${mimeType}`);
  return runExtraction([
    { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: buffer.toString("base64") } },
    { type: "text", text: `${hintFor(kind)} This is an uploaded image: it may be a photo or scan of an invoice, a catalogue page, or a photo of a product.` },
  ]);
}

/** Canonical headers used when AI output is turned into a table (identity mapping downstream). */
export const AI_HEADERS = [
  "title", "brand", "modelCode", "sku", "barcode", "costPrice", "quantity", "rrp", "length", "size", "width",
  "colour", "gender", "season", "category", "description", "flex", "abilityLevel", "dinRange", "terrain", "tags", "imageUrls",
] as const;

export function aiExtractionToTable(result: AiExtraction, method: ExtractedTable["method"], text?: string): ExtractedTable {
  const rows = result.items.map((item) => {
    const row: Record<string, string> = {};
    for (const key of AI_HEADERS) {
      const value = item[key as keyof typeof item];
      row[key] = Array.isArray(value) ? value.join(" | ") : value === null || value === undefined ? "" : String(value);
    }
    return row;
  });
  const warnings: string[] = [];
  if (result.summary) warnings.push(result.summary);
  if (result.documentType === "INVOICE" && result.gstTreatment === "UNKNOWN") warnings.push("Could not tell whether prices include GST; check the batch GST setting.");
  if (result.documentType === "OTHER") warnings.push("The AI could not find product information in this file.");
  return { headers: [...AI_HEADERS], rows, method, text, warnings };
}

/** Metadata the AI noticed about the document as a whole, for pre-filling the batch. */
export function aiDocumentMeta(result: AiExtraction) {
  return {
    documentType: result.documentType,
    supplier: result.supplier,
    invoiceNumber: result.invoiceNumber,
    currency: result.currency || result.items.find((i) => i.currency)?.currency || "",
    gstTreatment: result.gstTreatment,
  };
}
