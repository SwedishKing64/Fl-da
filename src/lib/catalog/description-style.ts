/**
 * A product body in the shop's own format.
 *
 * The readers — a brand page somebody linked, the web lookup, a spec sheet — give the
 * manufacturer's description and its details lines. `houseBody` lays those out the plain way:
 * paragraphs, then a heading, then the details as a list. A shop that has said how its
 * descriptions should read (setup → "How you list" → Descriptions) gets them laid out that way
 * instead: the model is handed the same words and the shop's instructions and arranges them, and
 * it may not add a fact. Anything that stops it — no key, no instructions, nothing worth shaping,
 * a failure — falls back to the plain layout, so a body is never lost to the styling.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, WORKING_MODEL, aiAvailable } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { houseBody, isPlaceholderBody, sanitiseBody } from "./body";
import { houseConventions } from "./taxonomy";
import { englishVariant, retailer } from "./shop-profile";

const SHAPE_MS = 40_000;

const Shaped = z.object({
  bodyHtml: z.string().describe("The description laid out in the shop's format, as HTML using only <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em> and <br>. Only the words and facts given."),
});

const SYSTEM = (format: string, heading: string, example: string) => [
  `You lay out product copy for the Shopify store of ${retailer()}, in the shop's own format. ${englishVariant()}.`,
  "You are given the manufacturer's description and the details lines from its page or spec sheet. Use only those words and facts. Never add a specification, a claim, a comparison or a price that is not given; you may trim, reorder and lightly rephrase to fit the format, and leave out marketing filler. Where the shop's format asks for something the input does not carry, leave it out rather than invent it.",
  `The shop's instructions for every description:\n${format.trim() || "(none beyond the layout below)"}`,
  heading.trim() ? `Where the details are listed, the heading over the list is "${heading.trim()}".` : "The details are listed without a heading.",
  example.trim() ? `A description from this shop, as the shape to match:\n${example.trim()}` : "",
  "Output HTML using only <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em> and <br>. No attributes, no other tags.",
].filter(Boolean).join("\n\n");

export type Shaper = (system: string, content: string) => Promise<string | undefined>;
const askModel: Shaper = async (system, content) => {
  const response = await (anthropicClient(1) as Anthropic).messages.stream({
    model: WORKING_MODEL,
    max_tokens: 3000,
    system,
    output_config: { format: zodOutputFormat(Shaped), effort: "low" },
    messages: [{ role: "user", content }],
  }, { timeout: SHAPE_MS, maxRetries: 1, signal: AbortSignal.timeout(SHAPE_MS) }).finalMessage();
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

/** True when the shop has said anything about how descriptions should read. */
export function hasDescriptionStyle(): boolean {
  const d = houseConventions().descriptions;
  return Boolean(d.format.trim() || d.example.trim());
}

/**
 * The body for a product, from what a reader gave: in the shop's format where it has one and the
 * content is worth shaping, the plain layout otherwise.
 */
export async function shopBody(description: string, features: string[], deps: { ask?: Shaper } = {}): Promise<string> {
  const d = houseConventions().descriptions;
  const plain = houseBody(description, features, d.specsHeading);
  if (!plain || !hasDescriptionStyle()) return plain;
  // The invoice's one-liner is not copy; there is nothing to lay out until a reader finds the words.
  if (isPlaceholderBody(plain)) return plain;
  if (!deps.ask && !aiAvailable()) return plain;
  const ask = deps.ask ?? askModel;
  try {
    const text = await ask(SYSTEM(d.format, d.specsHeading, d.example), JSON.stringify({ description, details: features }));
    if (!text) return plain;
    const parsed = Shaped.safeParse(JSON.parse(text));
    if (!parsed.success) return plain;
    const shaped = sanitiseBody(parsed.data.bodyHtml);
    return shaped.trim() ? shaped : plain;
  } catch {
    return plain;
  }
}
