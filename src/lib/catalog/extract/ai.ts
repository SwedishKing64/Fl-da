// Claude-backed extraction of line items from unstructured invoice text, PDFs and images.
// Uses structured outputs so the response is schema-valid JSON we can drop straight into
// the canonical mapping step (headers are canonical field keys).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ExtractedTable } from "./types";

export const EXTRACTION_MODEL = process.env.CATALOG_AI_MODEL || "claude-opus-5";

const LineItemSchema = z.object({
  title: z.string().describe("Product name without size/length/colour suffixes, e.g. 'Bent 90'"),
  brand: z.string().describe("Brand or vendor if stated, else empty"),
  modelCode: z.string().describe("Model/style code shared across sizes of the same product, else empty"),
  sku: z.string().describe("Supplier SKU / item code for this exact variant, else empty"),
  barcode: z.string().describe("EAN/UPC if present, digits only, else empty"),
  costPrice: z.number().nullable().describe("Unit cost price as a number, before any line total; null if unknown"),
  currency: z.string().describe("ISO currency code if stated on the document, else empty"),
  quantity: z.number().nullable().describe("Units ordered/invoiced for this line"),
  rrp: z.number().nullable().describe("Recommended retail price if stated"),
  length: z.string().describe("Ski/snowboard length in cm, digits only, else empty"),
  size: z.string().describe("Boot size (mondopoint) or apparel size, else empty"),
  width: z.string().describe("Boot last width in mm or ski waist width, else empty"),
  colour: z.string().describe("Colourway, else empty"),
  gender: z.string().describe("Mens/Womens/Unisex/Kids if stated, else empty"),
  season: z.string().describe("Season/model year like '2026' or 'FW25', else empty"),
  category: z.string().describe("One of: skis, snowboards, boots, bindings, poles, helmets, goggles, apparel, accessories, other"),
  description: z.string().describe("Any spec/feature text attached to the line, else empty"),
  flex: z.string().describe("Flex rating if stated"),
  abilityLevel: z.string().describe("Ability level if stated (Beginner/Intermediate/Advanced/Expert)"),
  dinRange: z.string().describe("Binding DIN range if stated, e.g. '4-13'"),
  terrain: z.string().describe("Terrain/use if stated, e.g. All-Mountain, Freeride, Park"),
  imageUrls: z.array(z.string()).describe("Any image URLs printed for this line"),
});

const ExtractionSchema = z.object({
  supplier: z.string().describe("Supplier/company name issuing the document, else empty"),
  invoiceNumber: z.string().describe("Invoice / order confirmation number, else empty"),
  currency: z.string().describe("Document currency ISO code if determinable, else empty"),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE", "UNKNOWN"]).describe("How unit prices are expressed with respect to Australian GST"),
  items: z.array(LineItemSchema),
});

export type AiExtraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You extract product line items from ski and snowboard supplier invoices, order confirmations and spec sheets for an Australian retailer.

Rules:
- One output item per purchasable variant line (each length/size/colour is its own line item).
- title is the product name only; put length/size/colour in their own fields. Keep the brand out of the title if it is identifiable separately.
- modelCode is the code shared across sizes of the same product (style number); sku is the code unique to this variant. If only one code exists, put it in sku and derive modelCode by stripping the size/colour suffix when that is obvious, otherwise leave modelCode empty.
- costPrice is the UNIT price for one item, never the line total. Strip currency symbols.
- Never invent values. Leave a string empty or a number null when the document does not state it.
- Ignore freight, deposit, discount, subtotal and tax summary lines - they are not products.
- gstTreatment: EXCLUSIVE when prices are marked ex GST / plus GST, INCLUSIVE when marked inc GST, NONE when the supplier is overseas and no GST applies, otherwise UNKNOWN.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

type ContentBlocks = Anthropic.MessageParam["content"];

async function runExtraction(content: ContentBlocks): Promise<AiExtraction> {
  const stream = getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 64000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(ExtractionSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("The AI declined to process this document");
  if (message.stop_reason === "max_tokens") throw new Error("Document too large for a single extraction; split the file");
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  return ExtractionSchema.parse(JSON.parse(text));
}

export async function extractFromText(text: string): Promise<AiExtraction> {
  return runExtraction([{ type: "text", text: `Extract every product line item from this document:\n\n<document>\n${text}\n</document>` }]);
}

export async function extractFromPdf(buffer: Buffer): Promise<AiExtraction> {
  return runExtraction([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    { type: "text", text: "Extract every product line item from this document." },
  ]);
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function extractFromImage(buffer: Buffer, mimeType: string): Promise<AiExtraction> {
  if (!IMAGE_TYPES.has(mimeType)) throw new Error(`Unsupported image type ${mimeType}`);
  return runExtraction([
    { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: buffer.toString("base64") } },
    { type: "text", text: "This is a photo or scan of a supplier invoice. Extract every product line item." },
  ]);
}

/** Canonical headers used when AI output is turned into a table (identity mapping downstream). */
export const AI_HEADERS = [
  "title", "brand", "modelCode", "sku", "barcode", "costPrice", "quantity", "rrp", "length", "size", "width",
  "colour", "gender", "season", "category", "description", "flex", "abilityLevel", "dinRange", "terrain", "imageUrls",
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
  if (result.gstTreatment === "UNKNOWN") warnings.push("Could not tell whether prices include GST; check the batch GST setting.");
  return { headers: [...AI_HEADERS], rows, method, text, warnings };
}

/** Metadata the AI noticed about the document as a whole, for pre-filling the batch. */
export function aiDocumentMeta(result: AiExtraction) {
  return {
    supplier: result.supplier,
    invoiceNumber: result.invoiceNumber,
    currency: result.currency || result.items.find((i) => i.currency)?.currency || "",
    gstTreatment: result.gstTreatment,
  };
}
