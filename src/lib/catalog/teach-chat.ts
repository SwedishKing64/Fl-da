/**
 * Teaching Snaben by talking to it.
 *
 * "Osprey titles never carry the vendor, and anything from Sea to Summit is a Pack" is two
 * rules said in one breath. The chat on Teach Snaben hands what the shop says to the model with
 * the shapes a rule can take — a tag rule, a pricing rule, a house convention, a product type's
 * tags, a template's notes, a word in the shop's voice, a section of the shop's own, a note on a
 * brand — and the model answers with proposals in those shapes, each with the sentence it will
 * mean. Each is shown with Accept beside it, as beliefs are shown, and nothing is written until
 * accepted; actions.ts then calls the same save each belief's editor calls. Reading done here
 * teaches the shop's copy, so it is marked as training and not counted against the plan.
 *
 * Pure apart from `proposeTeaching`, which asks the model.
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicClient, WORKING_MODEL, aiAvailable } from "./anthropic";
import { asTraining } from "./training-mark";

const ROUND = ["NONE", "0.99", "0.95", "1.00", "5.00", "10.00"] as const;
const HOUSE_PATHS = ["naming.brandInTitle", "naming.season", "naming.casing", "naming.audience", "naming.example", "identifiers.sku", "identifiers.barcode", "descriptions.format", "descriptions.specsHeading", "notes"] as const;

export const Change = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tag-rule"), matchField: z.enum(["brand", "productType", "title", "any"]).describe("What the pattern is matched against."), pattern: z.string().describe("Plain text the field must include, or a regular expression."), addTags: z.string().describe("Tags to add, comma separated; may be empty when only the type is set."), setProductType: z.string().describe("The product type to set, or empty.") }),
  z.object({ kind: z.literal("pricing"), scope: z.enum(["DEFAULT", "CATEGORY", "BRAND", "PRODUCT"]), matchValue: z.string().describe("The brand, category or product the rule is for; empty for DEFAULT."), mode: z.enum(["MARGIN", "MARKUP"]), percent: z.number(), roundTo: z.enum(ROUND) }),
  z.object({ kind: z.literal("house"), path: z.enum(HOUSE_PATHS), value: z.string().describe("For a choice, one of its keys: brandInTitle never|always; season seasonal|always|never|chosen; casing shop|supplier; audience front|none; sku supplier|barcode|none; barcode keep|required|none. Otherwise the text.") }),
  z.object({ kind: z.literal("kind"), type: z.string().describe("A product type the shop has."), field: z.enum(["calledAs", "tags", "variesTags", "titleFormat"]), value: z.string().describe("For tags, comma separated.") }),
  z.object({ kind: z.literal("template-notes"), scope: z.enum(["BRAND", "PRODUCT_TYPE"]), matchValue: z.string(), notes: z.string().describe("Instructions to the writer for this brand or type.") }),
  z.object({ kind: z.literal("voice"), audience: z.string().optional(), use: z.array(z.string()).optional().describe("Words the shop uses."), avoid: z.array(z.string()).optional().describe("Words the shop never uses."), spellings: z.array(z.object({ from: z.string(), to: z.string(), brand: z.string() })).optional(), neverTags: z.array(z.object({ tag: z.string(), brand: z.string() })).optional() }),
  z.object({ kind: z.literal("section"), heading: z.string(), text: z.string(), types: z.array(z.string()).describe("Product types it applies to; empty for all."), brands: z.array(z.string()).describe("Brands it applies to; empty for all.") }),
  z.object({ kind: z.literal("brand-note"), brand: z.string(), fit: z.string(), care: z.string(), origin: z.string() }),
  z.object({ kind: z.literal("setting"), key: z.enum(["seoTone", "seoTitlePattern", "houseRules", "defaultRoundTo", "minMarginPct"]), value: z.string() }),
]);
export type Change = z.infer<typeof Change>;

export const Proposal = z.object({ sentence: z.string().describe("What this will mean, as one plain sentence the shop would say: 'Every Osprey product is tagged Packs.'"), change: Change });
export type Proposal = z.infer<typeof Proposal>;

const Answer = z.object({
  reply: z.string().describe("A short answer to the person, one to three sentences: what was understood, what is proposed, what could not be made a rule and why."),
  proposals: z.array(Proposal),
});
export type TeachAnswer = z.infer<typeof Answer>;

export interface Turn { role: "user" | "assistant"; content: string }

/** What the model is told about this shop so its proposals fit: types, brands, tags, what is already believed. */
export interface TeachContext {
  shop: string;
  types: string[];
  brands: string[];
  tags: string[];
  /** The beliefs in force, as sentences. */
  beliefs: string[];
}

const SYSTEM = `You help a shop teach Snaben, the software that builds its Shopify listings from suppliers' paperwork, how the shop lists things. The person types in plain words; you answer with the rules their words amount to, in the shapes Snaben keeps:

- tag-rule: when a product's brand, type or title includes a pattern, add tags and/or set its product type. "Everything from Osprey is a pack" is a tag-rule on brand "Osprey" that sets the type Backpacks. Where the person wants the vendor itself changed (a distributor's name read as the brand), say in the reply that a tag rule cannot change the vendor and propose a house note instead.
- pricing: a margin or markup for a brand, category, product or everything, with a price ending.
- house: a convention about titles (brand in the title, model year, casing, Men's/Women's up front), identifiers, the description layout, or a standing note to the writer.
- kind: what a product type is called, the tags every one of its products carries, the tags that vary, how its titles read.
- template-notes: instructions to the writer for one brand or one product type.
- voice: who the shop writes for, words it uses, words it never uses, spellings (from → to, for one brand or all), tags it never writes.
- section: a section of the shop's own added after every copy ("Fitted in store", "Our warranty"), for some types or brands or all.
- brand-note: fit, care and origin notes for a brand, written into every product of that brand.
- setting: the SEO tone, the SEO title pattern ({title} {brand} {type} {shop}), house rules for the writer, the default price ending (NONE, 0.99, 0.95, 1.00, 5.00, 10.00), the margin floor in percent.

Rules:
- Propose only what the person said. Never invent a rule they did not ask for, and never guess a number they did not give.
- Use the shop's own names for types, brands and tags where they exist in the context; otherwise use the person's words exactly.
- Where a thing cannot be a rule in these shapes, say so in the reply and propose nothing for it.
- Each proposal's sentence is one plain sentence in the shop's terms, as it will read on Teach Snaben.
- Where the person is asking a question rather than teaching, answer it from the beliefs given and propose nothing.`;

const ASK_MS = 60_000;

/** The model's reading of what the shop said: a reply and the rules it amounts to. Null when the model is not available. */
export async function proposeTeaching(turns: Turn[], context: TeachContext): Promise<TeachAnswer | null> {
  if (!aiAvailable() || !turns.length) return null;
  const ctx = [
    `The shop: ${context.shop}.`,
    context.types.length ? `Its product types: ${context.types.slice(0, 120).join(", ")}.` : "It has no product types yet.",
    context.brands.length ? `Its brands: ${context.brands.slice(0, 150).join(", ")}.` : "",
    context.tags.length ? `Tags it uses: ${context.tags.slice(0, 200).join(", ")}.` : "",
    context.beliefs.length ? `What Snaben already believes about it:\n- ${context.beliefs.slice(0, 120).join("\n- ")}` : "",
  ].filter(Boolean).join("\n\n");
  const response = await asTraining(() => anthropicClient(1).messages.parse({
    model: WORKING_MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM }, { type: "text", text: ctx }],
    output_config: { format: zodOutputFormat(Answer) },
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  }, { timeout: ASK_MS, maxRetries: 1, signal: AbortSignal.timeout(ASK_MS) }));
  const answer = response.parsed_output;
  if (!answer) return null;
  return { reply: answer.reply.trim(), proposals: answer.proposals.map((p) => ({ sentence: p.sentence.trim() || describeChange(p.change), change: p.change })) };
}

const list = (xs: string[]) => xs.filter(Boolean).join(", ");

/** A change said as a sentence, for when the model's own sentence is missing and for the audit log. */
export function describeChange(c: Change): string {
  switch (c.kind) {
    case "tag-rule": {
      const where = c.matchField === "any" ? `brand, type or title includes "${c.pattern}"` : `${c.matchField === "productType" ? "product type" : c.matchField} includes "${c.pattern}"`;
      const does = [c.addTags.trim() && `is tagged ${c.addTags.trim()}`, c.setProductType.trim() && `is filed as ${c.setProductType.trim()}`].filter(Boolean).join(" and ");
      return `A product whose ${where} ${does || "is matched"}.`;
    }
    case "pricing": return `${c.scope === "DEFAULT" ? "Every product" : `${c.matchValue}`}: ${c.percent}% ${c.mode.toLowerCase()}${c.roundTo === "NONE" ? "" : `, prices ending ${c.roundTo}`}.`;
    case "house": return `${c.path.replace(/\./g, " ")}: ${c.value}.`;
    case "kind": return `${c.type}: ${c.field === "calledAs" ? `called "${c.value}"` : c.field === "titleFormat" ? `titles read like "${c.value}"` : c.field === "tags" ? `every one tagged ${c.value}` : `each gets whichever fit of ${c.value}`}.`;
    case "template-notes": return `For ${c.matchValue}, the writer is told: ${c.notes}`;
    case "voice": return [c.audience && `The shop writes for ${c.audience}`, c.use?.length && `uses ${list(c.use)}`, c.avoid?.length && `never says ${list(c.avoid)}`, c.spellings?.length && `writes ${c.spellings.map((s) => `"${s.to}" not "${s.from}"${s.brand ? ` for ${s.brand}` : ""}`).join(", ")}`, c.neverTags?.length && `never tags ${c.neverTags.map((t) => `${t.tag}${t.brand ? ` on ${t.brand}` : ""}`).join(", ")}`].filter(Boolean).join("; ") + ".";
    case "section": return `"${c.heading}" is added after the copy${c.types.length || c.brands.length ? ` on ${list([...c.types, ...c.brands])}` : ""}: ${c.text}`;
    case "brand-note": return `${c.brand}: ${[c.fit && `fit, ${c.fit}`, c.care && `care, ${c.care}`, c.origin && `made, ${c.origin}`].filter(Boolean).join("; ")}.`;
    case "setting": return `${c.key}: ${c.value}.`;
  }
}
