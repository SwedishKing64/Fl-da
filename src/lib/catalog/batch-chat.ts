/**
 * Asking the batch.
 *
 * On the review page a person can say "which of these have no picture", "tag every Osprey pack
 * Hiking", "set the jackets to draft", "drop the two display stands", "find pages for the ones
 * without". The batch is given to the model as one line per product and the person's words come
 * back as a reply and a plan: the products to show, and the writes to make, each as a sentence
 * with the products it touches. Nothing is written until a person presses Apply on it, and each
 * write goes through the same action the grid uses, so the audit log has it. This is work on the
 * shop's own data, so it is counted against the plan like any other reading.
 *
 * Pure apart from `askBatch`, which asks the model.
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicClient, WORKING_MODEL, aiAvailable } from "./anthropic";
import type { ReviewProduct } from "./review-types";

const Ids = z.array(z.string()).describe("Product ids, exactly as given in the batch listing.");

export const Op = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("show"), productIds: Ids, why: z.string().describe("What these have in common, in a few words.") }),
  z.object({ kind: z.literal("retag"), productIds: Ids, add: z.array(z.string()), remove: z.array(z.string()) }),
  z.object({ kind: z.literal("set-type"), productIds: Ids, productType: z.string() }),
  z.object({ kind: z.literal("set-vendor"), productIds: Ids, vendor: z.string() }),
  z.object({ kind: z.literal("set-status"), productIds: Ids, status: z.enum(["draft", "active"]) }),
  z.object({ kind: z.literal("retitle"), productId: z.string(), title: z.string() }),
  z.object({ kind: z.literal("drop"), productIds: Ids }),
  z.object({ kind: z.literal("find-pages"), productIds: Ids }),
]);
export type Op = z.infer<typeof Op>;

export const Step = z.object({ sentence: z.string().describe("What this does, as one plain sentence naming how many products: 'Tag 4 Osprey packs Hiking.'"), op: Op });
export type Step = z.infer<typeof Step>;

const Answer = z.object({
  reply: z.string().describe("A short answer to the person: what was found or what is proposed, one to three sentences. Never claim a change was made; changes happen only when the person applies a step."),
  steps: z.array(Step),
});
export type BatchAnswer = z.infer<typeof Answer>;

export interface Turn { role: "user" | "assistant"; content: string }

const SYSTEM = `You help a shop check a batch of products that Snaben built from a supplier's paperwork, before it goes to Shopify. The batch is listed one product per line: id, title, brand, product type, tags, status, how many variants, the retail price range, how many pictures, and any flags.

The person asks in plain words. Answer with a reply and steps:
- show: the products that match what they asked about (a question, a filter), with why.
- retag, set-type, set-vendor, set-status, retitle, drop, find-pages: the writes their words amount to.

Rules:
- Use only ids from the listing. Never invent a product.
- Propose only what the person asked. A question gets a show step and no writes.
- Keep the shop's own spellings for tags and types as they appear in the listing.
- One step per kind of change; put every product it applies to in that one step.
- drop removes a product from the batch for good; propose it only when asked to remove, drop or delete.
- find-pages asks Snaben to look for each product's page on the maker's site; propose it when asked to find pages, descriptions or pictures.`;

const ASK_MS = 90_000;
const MAX_PRODUCTS = 400;

/** One line per product, as the model sees the batch. */
export function batchListing(products: ReviewProduct[]): string {
  return products.slice(0, MAX_PRODUCTS).map((p) => {
    const prices = p.variants.map((v) => v.retailPrice).filter((x) => x > 0);
    const price = prices.length ? (Math.min(...prices) === Math.max(...prices) ? `$${Math.min(...prices)}` : `$${Math.min(...prices)}–${Math.max(...prices)}`) : "no price";
    const flags = p.flags.map((f) => f.code).join(" ");
    return `${p.id} | ${p.title} | ${p.vendor || "no brand"} | ${p.productType || "no type"} | tags: ${p.tags || "none"} | ${p.status} | ${p.variants.length} variant${p.variants.length === 1 ? "" : "s"} | ${price} | ${p.images.length} pic${p.images.length === 1 ? "" : "s"}${flags ? ` | ${flags}` : ""}`;
  }).join("\n");
}

/** The steps with any id the batch does not have taken out, and steps left empty by that dropped. */
export function onlyKnown(steps: Step[], known: Set<string>): Step[] {
  const keep = (ids: string[]) => ids.filter((id) => known.has(id));
  const out: Step[] = [];
  for (const s of steps) {
    const op = s.op;
    if (op.kind === "retitle") { if (known.has(op.productId)) out.push(s); continue; }
    const ids = keep(op.productIds);
    if (ids.length) out.push({ ...s, op: { ...op, productIds: ids } });
  }
  return out;
}

/** The model's reading of what was asked. Null when the model is not available. */
export async function askBatch(turns: Turn[], products: ReviewProduct[], batchName: string): Promise<BatchAnswer | null> {
  if (!aiAvailable() || !turns.length) return null;
  const listing = batchListing(products);
  const response = await anthropicClient(1).messages.parse({
    model: WORKING_MODEL,
    max_tokens: 6000,
    system: [{ type: "text", text: SYSTEM }, { type: "text", text: `The batch "${batchName}", ${Math.min(products.length, MAX_PRODUCTS)} of ${products.length} products:\n${listing}` }],
    output_config: { format: zodOutputFormat(Answer) },
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  }, { timeout: ASK_MS, maxRetries: 1, signal: AbortSignal.timeout(ASK_MS) });
  const answer = response.parsed_output;
  if (!answer) return null;
  const known = new Set(products.map((p) => p.id));
  return { reply: answer.reply.trim(), steps: onlyKnown(answer.steps, known).map((s) => ({ ...s, sentence: s.sentence.trim() || describeOp(s.op) })) };
}

const n = (ids: string[]) => `${ids.length} product${ids.length === 1 ? "" : "s"}`;

/** A step said as a sentence, for when the model's own is missing and for the audit log. */
export function describeOp(op: Op): string {
  switch (op.kind) {
    case "show": return `${n(op.productIds)}: ${op.why}`;
    case "retag": return `${op.add.length ? `Tag ${n(op.productIds)} ${op.add.join(", ")}` : ""}${op.add.length && op.remove.length ? "; " : ""}${op.remove.length ? `take ${op.remove.join(", ")} off ${n(op.productIds)}` : ""}.`;
    case "set-type": return `File ${n(op.productIds)} as ${op.productType}.`;
    case "set-vendor": return `Set the brand of ${n(op.productIds)} to ${op.vendor}.`;
    case "set-status": return `Set ${n(op.productIds)} to ${op.status}.`;
    case "retitle": return `Rename one product to "${op.title}".`;
    case "drop": return `Drop ${n(op.productIds)} from the batch.`;
    case "find-pages": return `Find the maker's page for ${n(op.productIds)}.`;
  }
}

/** Whether a step writes anything, or only shows. */
export const writes = (op: Op): boolean => op.kind !== "show";
