// The wedge: don't just collect feedback — understand it. Given a customer's reply,
// return sentiment, themes, severity, a one-line summary, a drafted response, and whether
// it's testimonial-worthy.
//
// This is a deterministic, offline analyser so the product works (and is testable) with
// zero API keys. Swap `analyzeFeedback` for an LLM call behind the same signature to go
// from good to great — the rest of the app doesn't change.

export type Sentiment = "promoter" | "passive" | "detractor";

export type Theme =
  | "shipping"
  | "quality"
  | "sizing"
  | "support"
  | "packaging"
  | "value"
  | "product-love"
  | "other";

export interface Analysis {
  sentiment: Sentiment;
  severity: number; // 0 none · 1 minor · 2 needs attention · 3 urgent
  themes: Theme[];
  summary: string;
  suggestedReply: string;
  testimonialCandidate: boolean;
}

const THEME_WORDS: Record<Exclude<Theme, "other">, string[]> = {
  shipping: ["ship", "shipping", "delivery", "deliver", "arrived", "arrive", "late", "slow", "tracking", "courier", "dispatch", "delayed", "never came", "took forever"],
  quality: ["quality", "broke", "broken", "faulty", "defect", "cheap", "fell apart", "stopped working", "poor", "flimsy"],
  sizing: ["size", "sizing", "fit", "fits", "small", "large", "tight", "big", "runs small", "runs large"],
  support: ["support", "response", "reply", "contact", "service", "help", "rude", "ignored", "no one"],
  packaging: ["packaging", "packaged", "box", "wrapped", "damaged", "dented", "crushed"],
  value: ["price", "expensive", "overpriced", "worth", "value", "pricey"],
  "product-love": ["love", "amazing", "perfect", "beautiful", "excellent", "obsessed", "favourite", "favorite", "gorgeous", "brilliant", "best"],
};

const POSITIVE = ["love", "amazing", "perfect", "great", "excellent", "beautiful", "happy", "brilliant", "fantastic", "recommend", "obsessed", "wonderful", "best", "delighted", "gorgeous"];
const NEGATIVE = ["broke", "broken", "faulty", "disappointed", "disappointing", "terrible", "awful", "poor", "late", "never", "rude", "ignored", "refund", "worst", "damaged", "wrong", "waste", "unhappy", "slow"];
const HIGH_SEVERITY = ["never arrived", "never came", "refund", "broken", "broke", "faulty", "damaged", "wrong item", "wrong order", "stopped working"];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
const countHits = (text: string, words: string[]) => words.filter((w) => text.includes(` ${w} `) || text.includes(w)).length;

export function detectThemes(text: string): Theme[] {
  const t = norm(text);
  const found = (Object.keys(THEME_WORDS) as Array<Exclude<Theme, "other">>).filter(
    (theme) => THEME_WORDS[theme].some((w) => t.includes(w)),
  );
  return found.length ? found : ["other"];
}

export function scoreSentiment(text: string, rating?: number): Sentiment {
  if (typeof rating === "number") {
    if (rating >= 4) return "promoter";
    if (rating === 3) return "passive";
    return "detractor";
  }
  const t = norm(text);
  const score = countHits(t, POSITIVE) - countHits(t, NEGATIVE);
  if (score > 0) return "promoter";
  if (score < 0) return "detractor";
  return "passive";
}

function severityFor(sentiment: Sentiment, themes: Theme[], text: string): number {
  const t = norm(text);
  const urgent = HIGH_SEVERITY.some((w) => t.includes(w));
  if (sentiment === "detractor") return urgent ? 3 : 2;
  if (sentiment === "passive") return themes.some((x) => x !== "other" && x !== "product-love") ? 1 : 0;
  return 0;
}

const THEME_LABEL: Record<Theme, string> = {
  shipping: "shipping/delivery",
  quality: "product quality",
  sizing: "sizing/fit",
  support: "customer support",
  packaging: "packaging",
  value: "price/value",
  "product-love": "loving the product",
  other: "general",
};

function draftReply(sentiment: Sentiment, themes: Theme[]): string {
  const main = themes.find((x) => x !== "other" && x !== "product-love") ?? themes[0];
  if (sentiment === "detractor") {
    const fix: Record<string, string> = {
      shipping: "the delivery falling short",
      quality: "the product not being up to standard",
      sizing: "the fit being off",
      support: "us being slow to respond",
      packaging: "it arriving damaged",
    };
    return `Hi there — I'm really sorry about ${fix[main] ?? "this experience"}. That's not what we want for you. I've flagged it to our team and we'll make it right — expect a personal note shortly.`;
  }
  if (sentiment === "promoter") {
    return `Thank you so much — this genuinely made our day! If you have a moment, would you mind sharing it as a review? It helps other shoppers enormously. 💛`;
  }
  return `Thanks for the honest feedback. We'd love to have earned five stars — is there one thing we could have done better?`;
}

export function analyzeFeedback(text: string, rating?: number): Analysis {
  const themes = detectThemes(text);
  const sentiment = scoreSentiment(text, rating);
  const severity = severityFor(sentiment, themes, text);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const label = THEME_LABEL[themes[0]];
  const summary =
    sentiment === "promoter"
      ? `Happy customer — ${label}.`
      : sentiment === "detractor"
        ? `Unhappy — issue with ${label}${severity === 3 ? " (urgent)" : ""}.`
        : `Mixed — mentions ${label}.`;

  const testimonialCandidate = sentiment === "promoter" && wordCount >= 6 && themes.includes("product-love");

  return { sentiment, severity, themes, summary, suggestedReply: draftReply(sentiment, themes), testimonialCandidate };
}
