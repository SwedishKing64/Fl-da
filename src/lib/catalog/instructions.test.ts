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

describe("what the person said not to build", () => {
  it("matches a product by the words they used, or by its handle from the checklist", async () => {
    const { isSkipped, describeDirectives, NO_DIRECTIVES } = await import("./instructions");
    expect(isSkipped({ title: "Kore 94 Ti 2026", handle: "kore-94-ti-2026" }, ["Kore 94"])).toBe(true);
    expect(isSkipped({ title: "Kore 94 Ti 2026 inc Tyrolia Attack 14 Binding Package", handle: "kore-94-ti-2026-inc-tyrolia-attack-14-binding-package" }, ["kore 94"])).toBe(true);
    expect(isSkipped({ title: "Kore 99 2026", handle: "kore-99-2026" }, ["Kore 94"])).toBe(false);
    expect(isSkipped({ title: "Men's Weekend Midweight Socks (2 Pack) 2026", handle: "mens-weekend-midweight-socks-2-pack-2026" }, ["socks"])).toBe(true);
    expect(isSkipped({ title: "Kids' Warmest Mittens 2027", handle: "kids-warmest-mittens-2027" }, ["kids-warmest-mittens-2027"])).toBe(true);
    expect(isSkipped({ title: "Kids' Warmest Mittens 2027", handle: "kids-warmest-mittens-2027" }, ["mitten"])).toBe(false);
    expect(isSkipped({ title: "Anything", handle: "anything" }, ["", "  "])).toBe(false);
    expect(describeDirectives({ ...NO_DIRECTIVES, skip: ["Kore 94", "socks"] })).toContain("Not built: Kore 94, socks");
  });
});

describe("the kinds of product to work with", () => {
  it("places a product by its Type, or by the category it was filed under, however the kind is spelled", async () => {
    const { isOfType, typeKey, describeDirectives, NO_DIRECTIVES } = await import("./instructions");
    expect(typeKey("Snowboard Bindings")).toBe(typeKey("snowboard-binding"));
    expect(isOfType({ productType: "Snowboards" }, ["snowboards"])).toBe(true);
    expect(isOfType({ productType: "Snowboards" }, ["Snowboard"])).toBe(true);
    expect(isOfType({ productType: "Snowboard Bindings" }, ["Snowboards"])).toBe(false);
    expect(isOfType({ productType: "", category: "snowboards" }, ["Snowboards"])).toBe(true);
    expect(isOfType({ productType: "Jackets" }, ["Snowboards", "Jackets"])).toBe(true);
    expect(isOfType({ productType: "Gloves" }, [])).toBe(true);
    expect(isOfType({ productType: "Gloves" }, ["", " "])).toBe(true);
    expect(describeDirectives({ ...NO_DIRECTIVES, types: ["Snowboards", "Snowboard Bindings"] })).toContain("Only these kinds: Snowboards, Snowboard Bindings");
    // What the build found is not a directive, and is not described as one.
    expect(describeDirectives({ ...NO_DIRECTIVES, typesSeen: ["Snowboards", "Gloves"] })).toEqual([]);
  });

  it("keeps the kinds the build found when an older batch's directives are read", async () => {
    const { parseDirectives } = await import("./instructions");
    expect(parseDirectives(JSON.stringify({ skip: ["socks"] })).types).toEqual([]);
    expect(parseDirectives(JSON.stringify({ types: ["Snowboards"], typesSeen: ["Snowboards", "Gloves"] })).typesSeen).toEqual(["Snowboards", "Gloves"]);
  });
});
