/**
 * What happens after a CSV is finished and someone spots something wrong with it.
 *
 * The conversation is not the point. A correction is only worth typing once, so the job here is to
 * turn "the Giro goggles came out as Ski Accessories, they should be Snowboard Accessories" into a
 * standing instruction that the next invoice is built against. Everything else — the apology, the
 * explanation — is just the wrapper around that.
 *
 * So each reply carries two things: an answer a person can read, and, where the correction is
 * general rather than a one-off, the sentence that should be added to the house rules. Adding it is
 * the person's decision, never the model's: a rule written from a misunderstanding would go on
 * being wrong on every product after it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, WORKING_MODEL, aiAvailable } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { retrying } from "./api-errors";

const ReplySchema = z.object({
  reply: z.string().describe("The answer to the person, in two or three sentences. Say what went wrong and what would fix it. Plain words, no markdown."),
  proposal: z.string().describe("What they told you, written as a standing instruction — their correction, in their terms, tidied into an imperative and no more. Do not soften it, do not generalise past it, and do not add conditions they did not state. Empty only when they asked a question rather than correcting something."),
  aboutOneProduct: z.boolean().describe("True when the correction is about one product on this invoice and could not sensibly apply to future ones."),
});

export type FeedbackReply = z.infer<typeof ReplySchema>;

export interface FeedbackTurn {
  role: "USER" | "ASSISTANT";
  body: string;
}

export interface FeedbackContext {
  /** What the batch produced, a line per product, so the reply can be about real products. */
  products: Array<{ title: string; vendor: string; productType: string; tags: string }>;
  /** The standing instructions already in force, so the reply does not propose one twice. */
  houseRules: string;
  batchName: string;
}

const SYSTEM = `You are the person who built a Shopify import for a ski and snowboard shop in Australia, and a member of staff has just looked at the CSV and told you something is wrong with it.

Answer them the way a good colleague would: say what went wrong, and what the right answer is. Be brief and concrete, and name the products you are talking about.

Then write what they told you as a standing instruction, in their terms. Take them literally. They know this catalogue and you do not: if they say goggles from snowboard brands are Snowboard Accessories, that is the rule, exactly that, not a hedged version of it and not a broader one. Tidy it into an imperative and change nothing else. Only leave the instruction empty when they asked you a question rather than correcting something.

Mark it as about one product when the correction plainly could not apply to a future invoice — a typo in one title, a price on one line — so nobody is offered a rule that makes no sense as a rule.

Never claim to have changed anything. You are proposing; a person decides.`;

const getClient = (): Anthropic => anthropicClient(6);

export function feedbackAvailable(): boolean {
  return aiAvailable();
}

function describe(context: FeedbackContext): string {
  const lines = context.products.slice(0, 60).map((p) => `- ${p.vendor} ${p.title} — type ${p.productType || "(none)"} — tags: ${p.tags || "(none)"}`);
  const more = context.products.length > 60 ? `\n…and ${context.products.length - 60} more products.` : "";
  return [
    `Batch: ${context.batchName}`,
    context.houseRules.trim() ? `Standing rules already in force:\n${context.houseRules.trim()}` : "There are no standing rules yet.",
    `What this batch built:\n${lines.join("\n")}${more}`,
  ].join("\n\n");
}

/** Answer the latest message in a thread, given what the batch produced. */
export async function answerFeedback(context: FeedbackContext, thread: FeedbackTurn[]): Promise<FeedbackReply | null> {
  if (!feedbackAvailable() || thread.length === 0) return null;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `${describe(context)}\n\n— end of context —` },
    { role: "assistant", content: "Understood. What did you find?" },
    ...thread.map((t) => ({ role: t.role === "USER" ? ("user" as const) : ("assistant" as const), content: t.body })),
  ];

  const response = await retrying(() => getClient().messages.stream({
    model: WORKING_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(ReplySchema), effort: "low" },
    messages,
  }).finalMessage());

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  const parsed = ReplySchema.safeParse(JSON.parse(text));
  if (!parsed.success) return null;
  // A correction about one product is not a rule; everything else is offered as one, in the words
  // the person used. They know the catalogue, so their correction is taken at face value.
  return parsed.data.aboutOneProduct ? { ...parsed.data, proposal: "" } : parsed.data;
}

/** Add an accepted instruction to the standing rules, keeping what is already there. */
export function withRule(houseRules: string, rule: string): string {
  const existing = houseRules.trim();
  const line = rule.trim().replace(/\s+/g, " ");
  if (!line) return existing;
  const already = existing.split("\n").some((l) => l.trim().toLowerCase() === line.toLowerCase());
  if (already) return existing;
  return existing ? `${existing}\n${line}` : line;
}
