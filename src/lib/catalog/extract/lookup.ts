/**
 * Looking a product up on the web, for the things an invoice does not carry.
 *
 * A supplier's invoice is a list of what was ordered, not a description of it. A Giro order names a
 * helmet and a pair of goggles and assumes you know who sent it; it rarely carries the brand, never
 * the marketing copy, and often not the recommended retail. All three are on the brand's own site.
 *
 * Two calls rather than one. The first searches the web and reads what it finds; the second turns
 * that prose into fields. Keeping them apart means the search is free to cite and quote, and the
 * structured pass never has to be both a researcher and a form-filler.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXTRACTION_MODEL, aiAvailable } from "./ai";
import { houseBody, isPlaceholderBody } from "../body";

/** What a lookup can establish. Anything it could not find comes back empty rather than invented. */
const FoundSchema = z.object({
  vendor: z.string().describe("The brand that makes this product, capitalised as the brand writes it. Empty if the search did not establish it."),
  description: z.string().describe("The manufacturer's own description of the product, in their words, 50-110 words. Blank line between paragraphs if it runs to two. Empty if not found."),
  features: z.array(z.string()).describe("The manufacturer's published specification lines, 6-14 of them, each as they write it — \"Label: value\" where their spec table is written that way, a bare phrase where it is not. Empty when none were found."),
  rrp: z.number().nullable().describe("Australian recommended retail in dollars, as a number. Null unless an Australian price was actually seen."),
  sourceUrl: z.string().describe("The page the description came from. Empty if none."),
  confident: z.boolean().describe("True only when the page found is unambiguously this exact product, not a similar model or a different year."),
});

export type ProductLookup = z.infer<typeof FoundSchema>;

export interface LookupRequest {
  title: string;
  /** Anything already known — a brand read off the invoice, the supplier the batch was filed under. */
  brandHint?: string;
  modelCode?: string;
  /** What kind of thing it is, so a search for "Ledge" does not come back about a cliff. */
  category?: string;
}

const RESEARCH_SYSTEM = `You research products for a ski and snowboard retailer in Australia who is building Shopify listings from supplier invoices.

For the product you are given, find the manufacturer's own page for it and report:
- which brand makes it
- the copy the manufacturer opens the product page with, quoted rather than summarised, to about 50-110 words
- the specification lines from the manufacturer's own spec table, as they write them — most read "Label: value" ("Sidecut radius front: 35 m @ 172", "Packed Size: 23 x 15 x 3 cm"), some are a bare phrase ("Multilayer Woodcore"). Ten or so is the usual number; report the ones the manufacturer publishes, not ones you compose.
- its recommended retail price in Australian dollars

Prefer the brand's own website, then its Australian distributor, then a major Australian retailer. Say plainly when you cannot find the product, when the page you found is a different model year, or when the only price you can see is in another currency — a wrong price is worse to this shop than no price. Quote the manufacturer rather than writing your own marketing copy, and give the URL of every page you rely on.`;

const SHAPE_SYSTEM = `Turn the research notes into fields. Copy what the notes establish and leave everything else empty or null — never fill a gap with something plausible. Keep the manufacturer's wording; do not paraphrase it into your own. Only give an rrp when the notes report an Australian price for this exact product, and only set confident when the notes identify the exact product rather than a similar one.`;

function describe(request: LookupRequest): string {
  return [
    request.brandHint ? `Brand (from the invoice, may be wrong or missing): ${request.brandHint}` : "Brand: not stated on the invoice",
    `Product: ${request.title}`,
    request.modelCode ? `Model code: ${request.modelCode}` : "",
    request.category ? `Kind of product: ${request.category}` : "",
  ].filter(Boolean).join("\n");
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 6 }); // see getClient in adjust-plan.ts: two retries does not ride out "overloaded"
  return client;
}

export function lookupAvailable(): boolean {
  return aiAvailable();
}

/**
 * Research one product and return what was established. An empty result is a real answer: it means
 * the product could not be found, and a person should go and look.
 */
export async function lookupProduct(request: LookupRequest): Promise<ProductLookup | null> {
  if (!lookupAvailable() || !request.title.trim()) return null;

  const research = await getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: RESEARCH_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: describe(request) }],
  }).finalMessage();

  const notes = research.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!notes) return null;

  const shaped = await getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    system: SHAPE_SYSTEM,
    output_config: { format: zodOutputFormat(FoundSchema), effort: "low" },
    messages: [{ role: "user", content: `${describe(request)}\n\nResearch notes:\n${notes}` }],
  }).finalMessage();

  const text = shaped.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!text) return null;
  const parsed = FoundSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

/**
 * What a lookup is allowed to change on a product: only the fields nobody has filled in.
 *
 * The invoice is the authority on everything it states — it is what the shop is actually being
 * charged for — so a lookup fills gaps and never overwrites anything a person wrote. The one
 * exception is the description, where the gap is filled with the invoice's own line at build time;
 * the manufacturer's copy replaces that. An unconfident lookup fills nothing but the description,
 * since a wrong brand or a wrong price is worse than an empty column.
 */
export function applyLookup<T extends { vendor: string; bodyHtml: string; rrp: number | null }>(product: T, found: ProductLookup): T {
  const out = { ...product };
  if (found.confident && !out.vendor.trim() && found.vendor.trim()) out.vendor = found.vendor.trim();
  if (isPlaceholderBody(out.bodyHtml) && found.description.trim()) out.bodyHtml = bodyHtmlFrom(found);
  if (found.confident && out.rrp === null && typeof found.rrp === "number" && found.rrp > 0) out.rrp = found.rrp;
  return out;
}

/**
 * The shop's own body layout, as their 827 existing products write it: a paragraph of the
 * manufacturer's copy per line, then a Tech Specs heading, then the spec lines as a list.
 *
 *   <p>...</p>
 *   <h2>Tech Specs</h2>
 *   <ul>
 *   <li>Sidecut radius front: 35 m @ 172</li>
 *   </ul>
 *
 * 414 of the 714 products that carry a body are exactly this with one paragraph, and another 143
 * are the same with two or three. Nothing follows the list.
 */
export function bodyHtmlFrom(found: ProductLookup): string {
  return houseBody(found.description, found.features);
}

// Re-exported so the modules that have always asked lookup for these keep working.
export { houseBody, isPlaceholderBody } from "../body";
