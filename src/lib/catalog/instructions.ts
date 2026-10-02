/**
 * What someone says about an invoice before it is built.
 *
 * "This is an Oakley closeout, everything needs the 2998 tag and it is all 30% off" is a true and
 * useful thing to say about a document, and there is no column on the invoice that says it. So it
 * is said in words, read into directives, and the build obeys them.
 *
 * Only a small, closed set of things can be asked for, and that is deliberate: a directive changes
 * every product in the batch, so it has to be something that can be checked at a glance and undone.
 * Anything outside the set is kept as a note, which reaches the copywriting but changes no field.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXTRACTION_MODEL, aiAvailable } from "./extract/ai";
import { retrying } from "./api-errors";

const DirectivesSchema = z.object({
  addTags: z.array(z.string()).describe("Tags to put on every product in this batch, exactly as the shop writes them. The season sentinels 2998 and 2999 belong here when asked for."),
  discountPct: z.number().nullable().describe("A percentage off every retail price, as a number: 30 for '30% off'. Null when no discount was mentioned."),
  vendor: z.string().describe("The brand every product in this batch is, when the invoice does not say and the person has. Empty otherwise."),
  productType: z.string().describe("The Type every product in this batch should carry, when the person has said. Empty otherwise."),
  season: z.string().describe("The four-digit year every product in this batch belongs to, as 2026 — the year tag and the year in each title — when they say which year this is. Empty when they have not said, and the year is then read off the supplier's file."),
  evergreen: z.boolean().describe("True when they have said these products do not change year to year and should carry the evergreen marker instead of a season."),
  packages: z.enum(["", "build", "none"]).describe("Ski binding packages. 'build' when they ask for the skis to be packaged / partnered / sold with a binding; 'none' when they say not to make packages; empty when they have not mentioned it (packages are then built as usual)."),
  packageBindings: z.array(z.object({
    for: z.enum(["mens", "womens", "kids", "all"]).describe("Which skis this binding goes with."),
    binding: z.string().describe("The binding as they named it, e.g. 'Marker Griffon', 'Squire', 'Look Pivot 12'."),
  })).describe("Which binding the packages are made with, when they say. 'Griffon for the men's and Squire for the women's' is two entries. Empty when they have not said."),
  deliveries: z.string().describe("Only the lines due in one delivery window, when they say so: a month as YYYY-MM ('only the December 2026 delivery' is 2026-12), a span as YYYY-MM..YYYY-MM, a whole year as YYYY ('only what has an estimated delivery of 26' is 2026), or an ordinal ('first delivery only' is 'first'). Empty when they have not said, and every line is built."),
  onlyNew: z.boolean().describe("True when they say to only add products the shop does not already have, and leave out the ones it already lists."),
  brands: z.array(z.string()).describe("Only the lines of these brands, when a sheet carries more than one brand and they say which to do: 'only Burton', 'start with Burton and do Anon separately', 'leave out Anon' (then the brands to keep are the others they named). Empty when they have not said."),
  notes: z.string().describe("Anything else worth knowing that is not one of the fields above — kept with the batch and used when copy is written. Empty when there is nothing."),
});

export type BatchDirectives = z.infer<typeof DirectivesSchema>;

export const NO_DIRECTIVES: BatchDirectives = {
  addTags: [],
  discountPct: null,
  vendor: "",
  productType: "",
  evergreen: false,
  season: "",
  packages: "",
  packageBindings: [],
  deliveries: "",
  onlyNew: false,
  brands: [],
  notes: "",
};

const SYSTEM = `A member of staff at a ski and snowboard shop in Australia is about to build Shopify products from a supplier invoice, and is telling you what is true about that invoice before it is read.

Turn what they say into directives that apply to every product in the batch. Take them at their word: if they say every product needs the 2998 tag, that is the tag, spelled as they spelled it. If they say everything is 30% off, that is 30.

Skis are built twice as a matter of course: flat, and as a package with a binding (men's with the Marker Griffon, women's with the Marker Squire), priced from the binding on the supplier's own price list. When they talk about packaging, partnering or selling skis with a binding, that is the packages and packageBindings fields.

An order form can span several deliveries — a column of quantities per month, or a delivery date per line. "Only the December 2026 delivery", "just the April order" or "only the lines with an estimated delivery of 26" is the deliveries field. "Only add the new products" / "leave out what we already have" is onlyNew. A sheet can carry two brands (Burton and Anon on one Burton order): "only Burton" / "start with Burton, Anon later" is the brands field.

Only fill a field they actually asked for. Everything else stays empty, null or false — a directive changes every product in the batch, so inventing one is expensive. Anything they say that is not one of the fields goes in notes, where it reaches the writing without changing a field.

Then write one short line back confirming what you will do, in their terms, so they can see you understood before the invoice is read. If they said something you cannot act on — a stock update, a change to one product, anything outside these fields — say so plainly in that line and say what they can do instead; never imply it will be done.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 6 }); // see getClient in adjust-plan.ts: two retries does not ride out "overloaded"
  return client;
}

export function instructionsAvailable(): boolean {
  return aiAvailable();
}

const ReadSchema = z.object({
  reply: z.string().describe("One or two short sentences confirming what will be done, in the person's own terms. Plain text."),
  directives: DirectivesSchema,
});

export type InstructionReading = z.infer<typeof ReadSchema>;

/**
 * Read a new instruction in the light of the ones already given, and return the whole set — so
 * "actually make it 40%" replaces the 30 rather than arguing with it.
 */
export async function readInstructions(thread: Array<{ role: "USER" | "ASSISTANT"; body: string }>, current: BatchDirectives): Promise<InstructionReading | null> {
  if (!instructionsAvailable() || thread.length === 0) return null;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Directives in force so far: ${JSON.stringify(current)}` },
    { role: "assistant", content: "Understood. What is true about this invoice?" },
    ...thread.map((t) => ({ role: t.role === "USER" ? ("user" as const) : ("assistant" as const), content: t.body })),
  ];

  const response = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(ReadSchema), effort: "low" },
    messages,
  }).finalMessage());

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  const parsed = ReadSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

/** Everything the directives say, in one line, for showing what a batch is being built under. */
export function describeDirectives(d: BatchDirectives): string[] {
  const out: string[] = [];
  if (d.vendor.trim()) out.push(`Brand: ${d.vendor.trim()}`);
  if (d.productType.trim()) out.push(`Type: ${d.productType.trim()}`);
  if (d.addTags.length) out.push(`Tags on every product: ${d.addTags.join(", ")}`);
  if (/^20\d{2}$/.test(d.season.trim())) out.push(`Year tag ${d.season.trim()} on every product`);
  if (d.evergreen) out.push("Evergreen, not a season");
  if (d.discountPct !== null) out.push(`${d.discountPct}% off every price`);
  if (d.packages === "none") out.push("No binding packages");
  if (d.packageBindings.length) out.push(`Packages with: ${d.packageBindings.map((b) => `${b.binding} (${b.for === "all" ? "all skis" : b.for})`).join(", ")}`);
  else if (d.packages === "build") out.push("Every ski also as a binding package");
  if (d.deliveries.trim()) out.push(`Only the ${/^\d{4}-\d{2}/.test(d.deliveries.trim()) ? d.deliveries.trim().replace("..", " to ") : `${d.deliveries.trim()}`} delivery`);
  if (d.onlyNew) out.push("Only products the shop does not already list");
  if (d.brands.length) out.push(`Only ${d.brands.join(" and ")}`);
  if (d.notes.trim()) out.push(d.notes.trim());
  return out;
}

export function parseDirectives(json: string): BatchDirectives {
  if (!json.trim()) return NO_DIRECTIVES;
  try {
    // Field by field, so directives saved before a field existed still read — a batch told "30% off"
    // last week keeps its 30% now that packages can be asked for too.
    const parsed = DirectivesSchema.partial().safeParse(JSON.parse(json));
    return parsed.success ? { ...NO_DIRECTIVES, ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) } : NO_DIRECTIVES;
  } catch {
    return NO_DIRECTIVES;
  }
}

/** A discount is a share off the price, never more than the price itself. */
export function discounted(price: number, pct: number | null | undefined): number {
  if (pct === null || pct === undefined || !Number.isFinite(pct) || pct <= 0) return price;
  const off = Math.min(pct, 100) / 100;
  return Math.round(price * (1 - off) * 100) / 100;
}
