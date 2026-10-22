// Claude-backed reading of uploaded files. One call classifies the document (invoice, spec
// sheet, price list, product photo…) and pulls out whatever is relevant for building Shopify
// products: purchasable line items for invoices, specs/descriptions for spec sheets, and what
// is visible in a product photo. Structured outputs keep the response schema-valid.

import Anthropic from "@anthropic-ai/sdk";
import { retailer, taxName } from "../shop-profile";
import { anthropicClient, cachedSystem, READING_MODEL, WORKING_MODEL } from "../anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ExtractedTable } from "./types";
import { retrying } from "../api-errors";
import { activeConventions, productTypes, typesAreKnown } from "../taxonomy";
import { packFor } from "../trades";
import { checkTotals, totalsDistance, type TotalsCheck } from "../totals";

export { EXTRACTION_MODEL } from "../anthropic";

export type DocumentType = "INVOICE" | "SPEC_SHEET" | "PRICE_LIST" | "PRODUCT_PHOTO" | "OTHER";

const LineItemSchema = z.object({
  title: z.string().describe("Product name without size/length/colour suffixes, e.g. 'Bent 90', 'Atmos AG', 'Hubba Hubba Tent'"),
  brand: z.string().describe("The brand ON the product — Volkl, Atomic, Osprey, MSR. NEVER the distributor, agent or wholesaler the document came from."),
  modelCode: z.string().describe("Model/style code shared across sizes of the same product, else empty"),
  sku: z.string().describe("Supplier SKU / item code for this exact variant, else empty"),
  barcode: z.string().describe("EAN/UPC if present, digits only, else empty"),
  costPrice: z.number().nullable().describe("Unit cost price as a number, before any line total, AFTER any discount written by hand against the line; null if the document has no cost (spec sheets, photos)"),
  currency: z.string().describe("ISO currency code if stated on the document, else empty"),
  quantity: z.number().nullable().describe("Units ordered/invoiced for this line; null when not an order"),
  rrp: z.number().nullable().describe("Recommended retail price if stated — printed in an RRP column, or written by hand against the line (see the handwriting rules)"),
  length: z.string().describe("A length in cm for skis, snowboards and poles, digits only; else empty. A length written as a word (Regular, Long, Short) is a variant, not a length."),
  size: z.string().describe("The size the line is sold in, as printed: apparel (XS–XXXL, 8, 10, 12), footwear with its system where printed (US 9.5, UK 8, EU 42), boot mondopoint (26.5), pack, harness or glove size (S/M, M/L), One Size. Else empty. On a size-grid invoice this is the column header the quantity sat under."),
  width: z.string().describe("Fit or width: Wide, Regular, Narrow, a boot last or ski waist in mm. Else empty."),
  colour: z.string().describe("The colourway's name. Where the line prints only a colour code (001, BLK, 4417) and the document names that code somewhere — a legend, another line, a heading — give the name; otherwise the code as printed. Else empty."),
  variant: z.string().describe("Any other option that tells this line apart from the same product's other lines and is not its length, size, width or colour: a tent's capacity (2P, 3 Person), a pack's or bag's volume (35L, 65L), a sleeping bag's length (Regular, Long) or zip side (Left Zip), a bottle's capacity (750ml). As printed. Else empty."),
  variantName: z.string().describe("What that option is called on a listing: Capacity, Volume, Length, Zip. Empty when variant is empty."),
  productType: z.string().describe("What kind of product this is, in the shop's own words: one of the shop's kinds listed in the message when there are any, else the plainest name for it (Tents, Hiking Packs, Sleeping Bags, Trail Shoes, Rain Jackets). Empty if you cannot tell."),
  gender: z.string().describe("Mens/Womens/Unisex/Kids if stated, else empty"),
  season: z.string().describe("Season/model year like '2026' or 'FW25', else empty. A two-digit year written by hand against the line — 23, 24, 27 — is that year: '2023', '2024', '2027'. A handwritten 2998 or 2999 is copied as written."),
  category: z.string().describe("One of: skis, snowboards, boots, bindings, poles, helmets, goggles, apparel, accessories, other. Boots means ski and snowboard boots; hiking boots, shoes, tents, packs, sleeping gear, cooking and climbing gear are other; clothing of any kind is apparel."),
  description: z.string().describe("Marketing description and key features in plain prose, else empty"),
  flex: z.string().describe("Flex rating if stated"),
  abilityLevel: z.string().describe("Ability level if stated (Beginner/Intermediate/Advanced/Expert)"),
  dinRange: z.string().describe("Binding DIN range if stated, e.g. '4-13'"),
  terrain: z.string().describe("Terrain/use if stated, e.g. All-Mountain, Freeride, Park"),
  tags: z.string().describe("Comma-separated tags a shop would use, only where the document genuinely suggests one (e.g. 'Freeride, Twin Tip'). Never the supplier's own section headings or marketing phrases. Empty is a good answer."),
  imageUrls: z.array(z.string()).describe("Any image URLs printed for this line"),
  notes: z.string().describe("What was written by hand against this line that is not a season, a retail price, a discount or a quantity, in plain words — 'QTY if it exists', 'should be 148cm', '+ SLR 10 binding', 'could also read 1699'. Empty when nothing was."),
});

const ExtractionSchema = z.object({
  documentType: z.enum(["INVOICE", "SPEC_SHEET", "PRICE_LIST", "PRODUCT_PHOTO", "OTHER"]).describe("What this document is"),
  summary: z.string().describe("One sentence on what the document contains and what was extracted"),
  supplier: z.string().describe("Supplier/company name issuing the document, else empty"),
  invoiceNumber: z.string().describe("Invoice / order confirmation number, else empty"),
  currency: z.string().describe("Document currency ISO code if determinable, else empty"),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE", "UNKNOWN"]).describe("How unit prices are expressed with respect to Australian GST"),
  statedTotals: z.object({
    units: z.number().nullable().describe("The total number of units the document states (Total Units, Total Qty, the sum line of the quantity column). Null when it prints none."),
    subtotal: z.number().nullable().describe("The value of the goods the document states, before freight, surcharges and tax, in the document's currency. Null when it prints none, or prints only a total that includes freight or tax."),
  }).describe("The totals printed on the document itself, copied as printed: they are checked against the lines read."),
  items: z.array(LineItemSchema),
});

export type AiExtraction = z.infer<typeof ExtractionSchema> & {
  /** Whether the lines read add up to the totals the document states. Set after the read; not asked of the model. */
  check?: TotalsCheck;
};

const SYSTEM = `You read documents uploaded by a retailer who is building Shopify products. Work out what each document is, then extract only what is relevant.

Document types:
- INVOICE / order confirmation: one item per purchasable variant line (each length/size/colour is its own item) with unit cost and quantity.
- PRICE_LIST / pre-book form: like an invoice but quantities may be absent; still one item per variant with the unit cost.
- SPEC_SHEET / catalogue page / workbook: one item per product (not per size) carrying brand, model, description, specs (flex, ability level, terrain, DIN, widths), the list of available lengths/sizes in the length/size field separated by commas, colourways, RRP if shown, and suggested tags. costPrice and quantity are null.
- PRODUCT_PHOTO: a photo of a product (skis, boots, apparel, a tent, a pack…). Return one item with the brand, model name, model code (if printed), colour and category you can see, everything else empty/null.
- OTHER: nothing useful; return no items.

Size grids (very common on apparel invoices, and the shape most often got wrong):
- Some invoices do not list one row per variant. Instead the sizes run ACROSS as column headers (S M L XL XXL XXXL, or 0 2 4 6 8 10 12 14 16 18 20, or 36 38 40 42, or US 8 8.5 9 9.5, or S/M M/L, or Regular Long) and each product row carries a quantity in the cell under each size it was ordered in. Empty cells were not ordered.
- When you see that, emit ONE ITEM PER SIZE THAT HAS A QUANTITY, not one item per row. Each item takes that size, that cell's quantity, and the row's name, code, colour and prices. A row with quantities under M and L is two items, not one.
- Quantities in those cells are often HANDWRITTEN, and may be circled or ticked. Read them as the quantity. A circle around a number does not change the number.
- Check your work against the row's printed total quantity ("2 EA", "3 EA") and the stated Total Units: the quantities you emit for a row should add up to it.
- A page may be photographed sideways or upside down. Read it in whatever orientation it is.

The brand is the brand on the product, never the company that sent the document:
- An order form, an invoice and a price list all carry a letterhead: a name, an address, a phone number, an email, usually top-right. That company is the DISTRIBUTOR — the agent this shop buys through. "Sportrade Australia" is who sells them Volkl; it is not the brand of a single ski, and it must never be the brand on an item.
- The brand is what is printed on the goods, and it is what the range is called: RACETIGER, BLAZE and MANTRA are Volkl; SQUIRE and GRIFFON are Marker. It is usually in the document's title, in a logo, in the sheet's name, or in the model codes — and it is the same for most or all of the rows.
- One workbook can hold two brands, most often a ski brand and the binding brand on the same order, or an outdoor agency's order spanning several of the brands it carries (Osprey packs and Sea to Summit sleeping mats). Give each item the brand of the thing that item IS.
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

Handwriting — a printed document the shop's staff have written on in pen, which is common and which the pen is the point of:
- Pen on a printed order or invoice is the shop's own instruction for that line, and it overrides the print. Read it with as much care as the print.
- A handwritten column heading names what the handwritten numbers beneath it are: "YT" (year tag) means the numbers under it are each line's season; "RRP" means recommended retail; "DISC" means a discount. Without a heading: a bare two-digit number beside a line (23, 24, 25, 27) is its season as a year (2023, 2024, 2025, 2027); a three-or-four-digit amount is its recommended retail (rrp); a percentage is a discount off the printed unit price, so costPrice is the printed unit price less that percentage. "2998" and "2999" are the shop's own season tags for closeouts and go in season as written.
- A quantity written in pen replaces the printed one. A line struck through in pen was not ordered: leave it out.
- Lines written entirely by hand — "more boots coming below", a model name with sizes and quantities such as "FORMULA RS 130 / 25.5 x1 / 26.5 x1", a retail and a discount — are items like any printed line: one item per size, the quantity after the "x", the rrp and the discount as written.
- "Title" written beside a column or a line is a reminder to the shop about naming and is not a value. Words like "QTY if it exists", "should be 148cm" or "+ SLR 10" are instructions a person will act on: carry them in the line's notes field, in plain words, and nowhere else.
- Where a handwritten figure could be read two ways, take the likelier and say in notes what else it could read.

Rules:
- title is the product name only; put length, size, width, colour and any other option (capacity, volume, zip side) in their own fields, so the lines of one product share one title: "Atmos AG" in 65L and 50L is one product with a Volume option, not two products. Keep the brand out of the title when it is identifiable separately. A number that is part of the model's name stays in the title: "Bent 100", "Hubba Hubba 2" when that is what the brand calls it.
- modelCode is the code shared across sizes of the same product (style number); sku is the code unique to this variant. If only one code exists, put it in sku and derive modelCode by stripping the size/colour suffix when obvious, otherwise leave modelCode empty.
- costPrice is the UNIT price for one item, never the line total. Strip currency symbols.
- Never invent values. Leave a string empty or a number null when the document does not state it.
- Ignore freight, deposit, discount, subtotal and tax summary lines - they are not products.
- On an INVOICE or PRICE_LIST, leave description, flex, abilityLevel, dinRange, terrain, tags and imageUrls empty on every item and keep summary to one short sentence: the shop fills those in from the brand's own pages, and a photographed invoice has to be read quickly.
- gstTreatment: EXCLUSIVE when prices are marked ex tax / plus tax (GST, VAT or whatever the shop's sales tax is called), INCLUSIVE when marked inc tax, NONE when the supplier is overseas and no local sales tax applies, otherwise UNKNOWN.`;

/** What differs by shop, after the fixed prompt so the fixed prompt is the same bytes for every shop. */
const SHOP = () => {
  const kinds = typesAreKnown() ? productTypes().slice(0, 120) : [];
  // How this trade's lines read, from the trade pack the shop started from (none for a blank shop).
  const examples = packFor(activeConventions().pack).readerExamples;
  return `The retailer is ${retailer()}; its sales tax is called ${taxName()}.${kinds.length ? ` The shop's kinds of product, for productType: ${kinds.join(", ")}.` : ""}${examples.length ? `\n\nHow lines in this trade read:\n${examples.map((e) => `- ${e}`).join("\n")}` : ""}`;
};

const getClient = (): Anthropic => anthropicClient(6);

export { aiAvailable } from "../anthropic";

type ContentBlocks = Anthropic.MessageParam["content"];

/**
 * How long one read may take, all attempts together.
 *
 * A read runs inside a request the host allows five minutes (maxDuration = 300 on the pages and
 * the upload route): the upload's background work, a page's Read again, the Bulk page's invoice
 * box. A read that outlasts the request is killed silently — nothing recorded, the file
 * "reading…" for ever — which is worse than a read that stops itself a little earlier and says
 * so, because a read that said so is tried again on its own.
 */
export const READ_BUDGET_MS = 240_000;

/** Said by a read that stopped itself at the budget. The page tries such a read again by itself. */
export const RAN_OUT_OF_TIME = "Ran out of time: the read did not finish inside the time a request is allowed.";

export function ranOutOfTime(message: string | null | undefined): boolean {
  return Boolean(message && message.startsWith("Ran out of time"));
}

/**
 * One read of a document, inside the budget.
 *
 * A photograph is read at the API's fast speed — the same model, answering up to two and a half
 * times faster — because the time a read takes is almost all the answer being written, and a
 * photographed invoice read at standard speed ran past the minute. Fast speed is a beta with its
 * own rate limit and not every model has it, so a refusal of it falls back to standard speed with
 * whatever time is left; a read that cannot finish in the time says so rather than being killed.
 */
/** How a document is read: a photograph at the service's fast speed, a known supplier's on the lighter model. */
export interface ReadOptions {
  visual?: boolean;
  /** The supplier's paperwork reads clean on its record, so the lighter model reads it at half the price. */
  known?: boolean;
}

/** Lines that count toward a document's totals: those with a quantity and a cost of their own. */
const countable = (r: AiExtraction) => r.items.map((i) => ({ quantity: i.quantity, costPrice: i.costPrice }));

/**
 * Read a document, and read it once more when its lines do not add up to the totals it states.
 *
 * The second read is told what the first one added up to and what the document says, which is
 * usually enough for it to find the line it skipped or doubled. The better of the two is kept, and
 * one that still does not add up carries the check, so the batch says so before anything is built.
 */
async function runExtraction(content: ContentBlocks, options: ReadOptions = {}): Promise<AiExtraction> {
  const started = Date.now();
  const first = await readOnce(content, options, READ_BUDGET_MS);
  const check = checkTotals(countable(first), first.statedTotals);
  if (check.ok || !check.checked) return { ...first, check };
  const left = READ_BUDGET_MS - (Date.now() - started);
  if (left < 60_000) return { ...first, check };
  const told: ContentBlocks = [
    ...(Array.isArray(content) ? content : [{ type: "text" as const, text: content }]),
    { type: "text", text: `A first reading of this document found ${first.items.length} lines adding up to ${check.units.read} units and ${check.subtotal.read.toFixed(2)} in goods, but the document states ${check.units.stated ?? "no unit total"}${check.units.stated !== null ? " units" : ""} and ${check.subtotal.stated !== null ? check.subtotal.stated.toFixed(2) : "no goods subtotal"}. Read it again, line by line, and find what was missed, read twice, or misread: a size-grid cell, a second page, a line total taken for a unit price.` },
  ];
  try {
    const second = await readOnce(told, options, left);
    const again = checkTotals(countable(second), second.statedTotals);
    return totalsDistance(again) < totalsDistance(check) ? { ...second, check: again } : { ...first, check };
  } catch {
    return { ...first, check };
  }
}

async function readOnce(content: ContentBlocks, options: ReadOptions, budgetMs: number): Promise<AiExtraction> {
  const deadline = Date.now() + budgetMs;
  const left = () => Math.max(5_000, deadline - Date.now());
  const params = {
    model: options.known ? WORKING_MODEL : READING_MODEL,
    max_tokens: 16000,
    system: cachedSystem(SYSTEM, SHOP()),
    thinking: { type: "adaptive" as const },
    output_config: { format: zodOutputFormat(ExtractionSchema), effort: "medium" as const },
    messages: [{ role: "user" as const, content }],
  };
  const standard = () => getClient().messages.stream(params, { timeout: left(), maxRetries: 0 }).finalMessage();
  const fast = () => getClient().beta.messages.stream({ ...params, betas: ["fast-mode-2026-02-01"], speed: "fast" }, { timeout: left(), maxRetries: 0 }).finalMessage();

  let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
  try {
    message = await retrying(async () => {
      // Fast speed is the reading model's alone; the lighter model is quick as it is.
      if (!options.visual || options.known) return standard();
      try {
        return await fast();
      } catch (err) {
        // Fast speed turned away — the model has none, or its separate rate limit is spent — is
        // not a reason to give up on the read: standard speed, with the time that is left.
        if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.RateLimitError || err instanceof Anthropic.PermissionDeniedError) return standard();
        throw err;
      }
    }, [2_000]);
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new Error(RAN_OUT_OF_TIME);
    throw err;
  }
  if (message.stop_reason === "refusal") throw new Error("The AI declined to process this document");
  if (message.stop_reason === "max_tokens") throw new Error("Document too large for a single extraction; split the file");
  const text = message.content.filter((b): b is Anthropic.TextBlock | Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
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

export async function extractFromText(text: string, kind?: string, options: ReadOptions = {}): Promise<AiExtraction> {
  return runExtraction([{ type: "text", text: `${hintFor(kind)} Extract what is relevant from this document:\n\n<document>\n${text}\n</document>` }], { known: options.known });
}

export async function extractFromPdf(buffer: Buffer, kind?: string, options: ReadOptions = {}): Promise<AiExtraction> {
  return runExtraction([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    { type: "text", text: `${hintFor(kind)} Extract what is relevant from this document.` },
  ], { visual: true, known: options.known });
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function extractFromImage(buffer: Buffer, mimeType: string, kind?: string, options: ReadOptions = {}): Promise<AiExtraction> {
  if (!IMAGE_TYPES.has(mimeType)) throw new Error(`Unsupported image type ${mimeType}`);
  return runExtraction([
    { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: buffer.toString("base64") } },
    { type: "text", text: `${hintFor(kind)} This is an uploaded image: it may be a photo or scan of an invoice, a catalogue page, or a photo of a product.` },
  ], { visual: true, known: options.known });
}

/** Canonical headers used when AI output is turned into a table (identity mapping downstream). */
export const AI_HEADERS = [
  "title", "brand", "modelCode", "sku", "barcode", "costPrice", "quantity", "rrp", "length", "size", "width",
  "colour", "gender", "season", "category", "description", "flex", "abilityLevel", "dinRange", "terrain", "tags", "imageUrls", "notes",
  "variant", "variantName", "productType",
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
  if (result.check && !result.check.ok) warnings.unshift(`Does not add up: ${result.check.message}`);
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
