import { describe, expect, it } from "vitest";
import { BAR, describeConfidence, scoreProduct, tallyConfidence, titleSupport, titleWords, type ConfidenceInput } from "./confidence";

const base = (over: Partial<ConfidenceInput> = {}): ConfidenceInput => ({
  title: "Atomic Bent 100 2027",
  vendor: "Atomic",
  typeKnown: true,
  tags: ["skis", "2027"],
  tagKnown: () => true,
  sourceText: "BENT 100 172 2027 ski",
  touched: new Set(),
  images: [{ source: "LOOKUP", validated: true }],
  retail: { value: 799, from: "paperwork", belowCost: false, underFloor: false },
  ...over,
});

describe("titleWords", () => {
  it("drops the brand, the year, stopwords and bare numbers", () => {
    expect(titleWords("Atomic Bent 100 2027 Mens 172cm", "Atomic")).toEqual(["bent"]);
    expect(titleWords("Burton Custom X Flying V", "Burton")).toEqual(["custom", "flying"]);
  });
});

describe("titleSupport", () => {
  it("is the share of title words found on the paperwork, loosely", () => {
    expect(titleSupport("Atomic Bent 100 2027", "Atomic", "BENT100 172 2027")).toBe(1);
    expect(titleSupport("Atomic Bent Chetler Twin", "Atomic", "BENT 100")).toBeCloseTo(1 / 3);
    expect(titleSupport("Atomic", "Atomic", "")).toBe(1);
  });
});

describe("scoreProduct", () => {
  it("is ready when every field is well founded", () => {
    const c = scoreProduct(base());
    expect(c.product).toBeGreaterThanOrEqual(BAR);
    expect(c.weakest).toBeNull();
    expect(c.reasons).toEqual({});
    expect(describeConfidence(c)).toBe("Ready.");
  });

  it("is pulled down by a title whose words are not on the paperwork", () => {
    const c = scoreProduct(base({ title: "Atomic Bent Chetler Freestyle Twin 2027", sourceText: "BENT 100 172" }));
    expect(c.title).toBe(45);
    expect(c.weakest).toBe("title");
    expect(describeConfidence(c)).toMatch(/title's words/);
  });

  it("trusts a title a person typed", () => {
    const c = scoreProduct(base({ title: "Something Else Entirely", touched: new Set(["title"]) }));
    expect(c.title).toBe(100);
  });

  it("takes a person's word that the picture and the price are right", () => {
    const c = scoreProduct(base({ images: [], retail: { value: 300, from: "lookup", belowCost: true, underFloor: true }, touched: new Set(["image", "price"]) }));
    expect(c.image).toBe(100);
    expect(c.price).toBe(100);
    expect(c.product).toBeGreaterThanOrEqual(BAR);
  });

  it("is pulled down by a tag the shop has never used", () => {
    const c = scoreProduct(base({ tags: ["skis", "freeride-twin"], tagKnown: (t) => t === "skis" }));
    expect(c.tags).toBe(40);
    expect(c.weakest).toBe("tags");
    expect(c.reasons.tags).toContain("freeride-twin");
  });

  it("has no confidence at all without a picture or a retail", () => {
    const c = scoreProduct(base({ images: [], retail: { value: 0, from: "none", belowCost: false, underFloor: false } }));
    expect(c.image).toBe(0);
    expect(c.price).toBe(0);
    expect(c.product).toBe(0);
    expect(c.weakest).toBe("image");
  });

  it("ranks pictures by whether they were checked against the colour", () => {
    expect(scoreProduct(base({ images: [{ source: "LOOKUP", validated: false }] })).image).toBe(60);
    expect(scoreProduct(base({ images: [{ source: "LOOKUP", validated: false }, { source: "MANUAL", validated: false }] })).image).toBe(75);
    expect(scoreProduct(base({ images: [{ source: "MANUAL", validated: false }] })).image).toBe(95);
  });

  it("treats a retail under the landed cost as a cost in the price column", () => {
    const c = scoreProduct(base({ retail: { value: 300, from: "paperwork", belowCost: true, underFloor: true } }));
    expect(c.price).toBe(10);
    expect(c.reasons.price).toMatch(/under the landed cost/);
  });

  it("marks a retail from the brand's website as worth a check", () => {
    const c = scoreProduct(base({ retail: { value: 799, from: "lookup", belowCost: false, underFloor: false } }));
    expect(c.price).toBe(70);
    expect(c.weakest).toBe("price");
  });

  it("only writes a sentence for the fields under the bar", () => {
    const c = scoreProduct(base({ retail: { value: 799, from: "lookup", belowCost: false, underFloor: false } }));
    expect(Object.keys(c.reasons)).toEqual(["price"]);
  });
});

describe("tallyConfidence", () => {
  it("counts the products that need nobody's eyes", () => {
    const ready = scoreProduct(base());
    const look = scoreProduct(base({ images: [] }));
    expect(tallyConfidence([{ confidence: ready }, { confidence: look }, { confidence: ready }])).toEqual({ ready: 2, needLook: 1 });
  });
});
