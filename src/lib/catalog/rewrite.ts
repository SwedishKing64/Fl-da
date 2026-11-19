/**
 * A supplier's paragraph rewritten in the shop's voice, for teaching by correction.
 *
 * On Teach Snaben a person pastes a maker's copy, sees Snaben's version in the shop's voice
 * beside it, and edits that. The words they swap are read off the edit (word-diff.ts) and offered
 * as the shop's spellings; the result shows how far the voice is taught. Reading here teaches the
 * shop's copy, so it is marked as training and not counted against the plan.
 */

import { anthropicClient, WORKING_MODEL, aiAvailable } from "./anthropic";
import { asTraining } from "./training-mark";
import { houseGuidance } from "./house";
import { houseConventions } from "./taxonomy";
import { englishVariant, retailer } from "./shop-profile";
import { voiceGuidance, voiceInForce, type VoiceTarget } from "./voice";

const ASK_MS = 60_000;

/** The copy in the shop's voice, as plain paragraphs; null when the model is not available or did not answer. */
export async function rewriteInVoice(text: string, target: VoiceTarget, houseRules = ""): Promise<string | null> {
  if (!aiAvailable() || !text.trim()) return null;
  const guidance = [houseGuidance(houseConventions()), houseRules, voiceGuidance(voiceInForce(), target)].filter((t) => t.trim()).join("\n\n");
  const response = await asTraining(() => anthropicClient(1).messages.create({
    model: WORKING_MODEL,
    max_tokens: 2000,
    system: [
      `You rewrite a supplier's product copy for the Shopify store of ${retailer()}, in ${englishVariant()}, in the shop's own voice. Use only the facts in the copy given; never add a specification, a claim or a price. Keep it about as long as the original. Answer with the rewritten copy only, as plain text paragraphs, no heading, no markup, no preamble.`,
      guidance ? `How this shop writes:\n\n${guidance}` : "The shop has not yet said how it writes; write plainly and warmly.",
    ].join("\n\n"),
    messages: [{ role: "user", content: text.trim().slice(0, 6000) }],
  }, { timeout: ASK_MS, maxRetries: 1, signal: AbortSignal.timeout(ASK_MS) }));
  const out = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return out || null;
}
