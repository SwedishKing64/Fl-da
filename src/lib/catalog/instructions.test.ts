import { describe, expect, it } from "vitest";
import { describeDirectives, discounted, NO_DIRECTIVES, parseDirectives } from "./instructions";

describe("a closeout discount", () => {
  it("takes its share off the price", () => {
    expect(discounted(100, 30)).toBe(70);
    expect(discounted(999, 30)).toBe(699.3);
  });

  it("leaves the price alone when nothing was asked for", () => {
    expect(discounted(100, null)).toBe(100);
    expect(discounted(100, undefined)).toBe(100);
    expect(discounted(100, 0)).toBe(100);
  });

  /** Nothing in the shop is worth less than nothing. */
  it("never takes off more than the price", () => {
    expect(discounted(100, 140)).toBe(0);
    expect(discounted(100, 100)).toBe(0);
  });

  it("ignores a number that is not one", () => {
    expect(discounted(100, Number.NaN)).toBe(100);
    expect(discounted(100, -20)).toBe(100);
  });
});

describe("reading directives back", () => {
  it("survives an empty or broken record", () => {
    expect(parseDirectives("")).toEqual(NO_DIRECTIVES);
    expect(parseDirectives("not json")).toEqual(NO_DIRECTIVES);
    expect(parseDirectives('{"addTags": "not an array"}')).toEqual(NO_DIRECTIVES);
  });

  it("keeps what was understood", () => {
    const json = JSON.stringify({ ...NO_DIRECTIVES, addTags: ["2998"], discountPct: 30, vendor: "Oakley" });
    expect(parseDirectives(json)).toEqual({ ...NO_DIRECTIVES, addTags: ["2998"], discountPct: 30, vendor: "Oakley" });
  });
});

describe("what a batch is being built under", () => {
  /** The Oakley closeout, said in one line each so it can be checked at a glance. */
  it("says it in the shop's terms", () => {
    expect(describeDirectives({ ...NO_DIRECTIVES, vendor: "Oakley", addTags: ["2998"], discountPct: 30 })).toEqual([
      "Brand: Oakley",
      "Tags on every product: 2998",
      "30% off every price",
    ]);
  });

  it("says nothing when nothing was asked for", () => {
    expect(describeDirectives(NO_DIRECTIVES)).toEqual([]);
  });
});
