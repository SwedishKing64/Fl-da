// The real, smart analyzer: Claude reads each reply and returns the same Analysis
// shape as the deterministic version, so the rest of the app is unchanged.
//
// Runs server-side only (needs ANTHROPIC_API_KEY). Uses structured outputs
// (messages.parse + a Zod schema) so the model is constrained to valid JSON — no
// brittle string parsing. Default model is claude-opus-4-8; for high-volume stores,
// switch MODEL to "claude-haiku-4-5" to cut cost/latency (same schema, same code).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Analysis, Sentiment, Theme } from "./analyze";

const MODEL = "claude-opus-4-8";

const THEMES = [
  "shipping", "quality", "sizing", "support", "packaging", "value", "product-love", "other",
] as const;

const AnalysisSchema = z.object({
  sentiment: z.enum(["promoter", "passive", "detractor"]),
  severity: z.number().int().describe("0 none, 1 minor, 2 needs a reply, 3 urgent"),
  themes: z.array(z.enum(THEMES)),
  summary: z.string().describe("one short, specific line for the merchant"),
  suggestedReply: z.string().describe("a drafted reply in the merchant's voice"),
  testimonialCandidate: z.boolean().describe("true only for glowing, quotable praise"),
});

const SYSTEM = `You analyse post-purchase customer replies for a small online store and turn each one into structured, actionable data.

Rules:
- sentiment: promoter (happy), passive (mixed/neutral), detractor (unhappy). If a star rating is given, let it anchor sentiment (4-5 promoter, 3 passive, 1-2 detractor) unless the words strongly disagree.
- themes: choose all that clearly apply from shipping, quality, sizing, support, packaging, value, product-love, other. Use "product-love" only for genuine enthusiasm about the product itself.
- severity: 0 for happy/neutral; 2 when an unhappy customer needs a reply; 3 when it's urgent (never arrived, refund demand, broken/faulty, wrong item).
- summary: one specific line the owner can scan (e.g. "Unhappy — cracked cup, arrived late (urgent)").
- suggestedReply: a warm, human reply in the store's voice. For unhappy customers, apologise and offer to make it right. For happy ones, thank them and invite a public review. Keep it 1-3 sentences, no placeholders.
- testimonialCandidate: true only when the reply is positive AND specific enough to quote publicly.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY / profile
  return client;
}

export async function analyzeWithClaude(text: string, rating?: number): Promise<Analysis> {
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(AnalysisSchema), effort: "low" },
    messages: [
      {
        role: "user",
        content: `Star rating: ${rating ?? "not given"}\nReply: """${text}"""`,
      },
    ],
  });

  const p = res.parsed_output;
  if (!p) throw new Error("Claude returned no parsed output");

  const themes = (p.themes.length ? p.themes : ["other"]) as Theme[];
  return {
    sentiment: p.sentiment as Sentiment,
    severity: Math.max(0, Math.min(3, Math.round(p.severity))),
    themes,
    summary: p.summary,
    suggestedReply: p.suggestedReply,
    testimonialCandidate: p.testimonialCandidate,
  };
}
