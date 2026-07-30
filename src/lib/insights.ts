// Aggregate many analysed replies into the "so what" surface: a satisfaction score,
// the sentiment split, and a ranked "what to fix first" by theme × severity.

import { Analysis, Sentiment, Theme, analyzeFeedback } from "./analyze";

export interface FeedbackItem {
  id: string;
  customer: string;
  product: string;
  orderRef: string;
  receivedLabel: string;
  rating?: number;
  text: string;
}

export interface AnalysedItem extends FeedbackItem {
  analysis: Analysis;
}

export interface ThemeInsight {
  theme: Theme;
  count: number;
  detractors: number;
  maxSeverity: number;
}

export interface Insights {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** Net Promoter-style score, -100..100. */
  score: number;
  topIssues: ThemeInsight[];
  testimonials: AnalysedItem[];
}

export function analyseAll(items: FeedbackItem[]): AnalysedItem[] {
  return items.map((it) => ({ ...it, analysis: analyzeFeedback(it.text, it.rating) }));
}

const COUNT = (items: AnalysedItem[], s: Sentiment) => items.filter((i) => i.analysis.sentiment === s).length;

export function buildInsights(items: FeedbackItem[]): Insights {
  const analysed = analyseAll(items);
  const total = analysed.length || 1;
  const promoters = COUNT(analysed, "promoter");
  const passives = COUNT(analysed, "passive");
  const detractors = COUNT(analysed, "detractor");
  const score = Math.round(((promoters - detractors) / total) * 100);

  const byTheme = new Map<Theme, ThemeInsight>();
  for (const it of analysed) {
    for (const theme of it.analysis.themes) {
      if (theme === "other" || theme === "product-love") continue;
      const cur = byTheme.get(theme) ?? { theme, count: 0, detractors: 0, maxSeverity: 0 };
      cur.count += 1;
      if (it.analysis.sentiment === "detractor") cur.detractors += 1;
      cur.maxSeverity = Math.max(cur.maxSeverity, it.analysis.severity);
      byTheme.set(theme, cur);
    }
  }
  // Rank by how much it hurts: severity first, then how many unhappy, then volume.
  const topIssues = [...byTheme.values()].sort(
    (a, b) => b.maxSeverity - a.maxSeverity || b.detractors - a.detractors || b.count - a.count,
  );

  const testimonials = analysed.filter((i) => i.analysis.testimonialCandidate);

  return { total: analysed.length, promoters, passives, detractors, score, topIssues, testimonials };
}
