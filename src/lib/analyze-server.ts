// Server-side analysis dispatcher: use Claude when an API key is configured, otherwise
// fall back to the deterministic analyzer so the app always works with zero setup.
// (If a live call errors, we degrade to deterministic rather than failing the page.)

import { analyzeFeedback } from "./analyze";
import type { Analysis } from "./analyze";
import type { AnalysedItem, FeedbackItem } from "./insights";

export function usingClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function analyze(text: string, rating?: number): Promise<Analysis> {
  if (usingClaude()) {
    try {
      const { analyzeWithClaude } = await import("./llm"); // load the SDK only when keyed
      return await analyzeWithClaude(text, rating);
    } catch {
      return analyzeFeedback(text, rating); // graceful degrade
    }
  }
  return analyzeFeedback(text, rating);
}

export async function analyzeItems(items: FeedbackItem[]): Promise<AnalysedItem[]> {
  return Promise.all(items.map(async (it) => ({ ...it, analysis: await analyze(it.text, it.rating) })));
}
