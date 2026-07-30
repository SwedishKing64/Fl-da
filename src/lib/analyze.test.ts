import { describe, expect, it } from "vitest";
import { analyzeFeedback, detectThemes, scoreSentiment } from "./analyze";
import { buildInsights } from "./insights";
import { FEEDBACK } from "@/mocks/feedback";

describe("scoreSentiment", () => {
  it("uses the rating when present", () => {
    expect(scoreSentiment("whatever", 5)).toBe("promoter");
    expect(scoreSentiment("whatever", 3)).toBe("passive");
    expect(scoreSentiment("whatever", 1)).toBe("detractor");
  });
  it("falls back to the text when there's no rating", () => {
    expect(scoreSentiment("absolutely love it, perfect")).toBe("promoter");
    expect(scoreSentiment("broken and late, so disappointed")).toBe("detractor");
  });
});

describe("detectThemes", () => {
  it("finds multiple themes in one reply", () => {
    const themes = detectThemes("arrived late and the cup was broken");
    expect(themes).toContain("shipping");
    expect(themes).toContain("quality");
  });
  it("returns 'other' when nothing matches", () => {
    expect(detectThemes("hello there")).toEqual(["other"]);
  });
});

describe("analyzeFeedback", () => {
  it("flags an urgent detractor (never arrived + refund)", () => {
    const a = analyzeFeedback("Never arrived and I want a refund", 1);
    expect(a.sentiment).toBe("detractor");
    expect(a.severity).toBe(3);
    expect(a.suggestedReply.toLowerCase()).toContain("sorry");
  });
  it("marks a glowing, descriptive reply as a testimonial", () => {
    const a = analyzeFeedback("Absolutely love this — beautiful and perfect fit, will order again", 5);
    expect(a.sentiment).toBe("promoter");
    expect(a.testimonialCandidate).toBe(true);
  });
  it("does not treat a terse 5-star as a testimonial", () => {
    expect(analyzeFeedback("thanks", 5).testimonialCandidate).toBe(false);
  });
});

describe("buildInsights", () => {
  const insights = buildInsights(FEEDBACK);

  it("computes an NPS-style score from the mix", () => {
    expect(insights.promoters).toBeGreaterThan(0);
    expect(insights.detractors).toBeGreaterThan(0);
    expect(insights.score).toBe(Math.round(((insights.promoters - insights.detractors) / insights.total) * 100));
  });
  it("ranks the most painful theme first (shipping is urgent in the sample)", () => {
    expect(insights.topIssues[0].theme).toBe("shipping");
    expect(insights.topIssues[0].maxSeverity).toBe(3);
  });
  it("surfaces testimonial candidates", () => {
    expect(insights.testimonials.length).toBeGreaterThanOrEqual(2);
  });
});
