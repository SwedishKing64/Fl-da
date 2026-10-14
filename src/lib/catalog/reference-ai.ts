/**
 * The order lines the rules could not place, put to the model.
 *
 * reference-match.ts joins an order to a supplier's reference sheet by code and by name, and it
 * knows the shorthand it has seen — Burton's FV for Flying V, a word with its vowels dropped. The
 * next supplier will have shorthand nobody has seen yet, and reading "MYS DEEP THINKER" or "CSTM X"
 * against a list of catalogue names is exactly the judgement a model is good at.
 *
 * Its answers are never taken on trust. It is shown the reference rows by code and may answer only
 * with one of those codes, or with none; an answer naming anything else is dropped. And it is only
 * ever asked about the lines the rules left over, so a line the rules placed cannot be moved by it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXTRACTION_MODEL } from "./extract/ai";
import { retrying } from "./api-errors";
import type { CanonicalLineItem } from "./types";

const Answer = z.object({
  joins: z.array(z.object({
    line: z.number().describe("The number of the order line, as given."),
    code: z.string().describe("The code of the ONE reference row this line is, exactly as listed — or an empty string when none of them is it."),
    why: z.string().describe("A few words: which words matched, or why none fits."),
  })),
});

const SYSTEM = `You match lines of a supplier's order form to rows of the same supplier's reference sheet (their product list with descriptions).

Order lines are written in warehouse shorthand: capitals, abbreviations with vowels dropped (COUNTRBLNCE = Counterbalance), initials (FV = Flying V), typos (GRAHIC), and a graphic or colourway name on the end ("NEW GRAPHIC", "JUNGLE", "FIRST TRACKS") that is NOT part of the model. Reference rows are written in full catalogue form, e.g. "Men's Custom Camber Snowboard".

A line matches a row only when it is the same MODEL. Rules:
- Every model word in the reference name must be on the order line, allowing for shorthand. Bend words (Camber, Flat Top, Directional) may be missing.
- Anything left on the line must be a graphic or colourway name. If what is left is a word from ANOTHER model's name (e.g. "X" or "Flying V"), it is a different model — answer none.
- A women's line is not a kids' model; a kids' line is not an adult model.
- When two rows would fit equally, or none fits, answer with an empty code. A wrong match puts another product's description on this one, which is worse than no description.`;

const getClient = (): Anthropic => anthropicClient(6);

/** Send the question and hand back the model's JSON text. Swappable, so the checks can be tested. */
type Ask = (content: string) => Promise<string | undefined>;

const askModel: Ask = async (content) => {
  const response = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Answer), effort: "low" },
    messages: [{ role: "user", content }],
  }).finalMessage());
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

export async function askToJoin(
  lines: Array<{ index: number; line: CanonicalLineItem }>,
  specs: CanonicalLineItem[],
  ask: Ask = askModel,
): Promise<Map<number, CanonicalLineItem>> {
  const byCode = new Map(specs.filter((s) => s.modelCode.trim() && s.title.trim()).map((s) => [s.modelCode.trim(), s]));
  if (lines.length === 0 || byCode.size === 0) return new Map();

  const content = [
    "Reference rows (code — name):",
    ...[...byCode].map(([code, s]) => `${code} — ${s.title}`),
    "",
    "Order lines to place:",
    ...lines.map((l) => `${l.index}. ${l.line.title}${l.line.gender ? ` (${l.line.gender})` : ""}${l.line.modelCode ? ` [code ${l.line.modelCode}]` : ""}`),
  ].join("\n");

  const text = await ask(content);
  if (!text) return new Map();
  const parsed = Answer.safeParse(JSON.parse(text));
  if (!parsed.success) return new Map();

  const asked = new Set(lines.map((l) => l.index));
  const out = new Map<number, CanonicalLineItem>();
  for (const join of parsed.data.joins) {
    const spec = byCode.get(join.code.trim());
    // Only a line it was asked about, and only a row that exists. Anything else is dropped.
    if (!spec || !asked.has(join.line)) continue;
    out.set(join.line, spec);
  }
  return out;
}
