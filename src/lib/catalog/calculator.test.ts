import { describe, expect, it } from "vitest";
import { applyRounding, retailFor, targetExGstPrice } from "./calculator";

/**
 * The calculator's arithmetic, restored after the pricing rules were removed. These are the same
 * numbers the old engine produced — the difference is only that nothing but the calculator can
 * reach them now.
 */
describe("the price calculator", () => {
  const settings = { gstRate: 0.1, pricesIncludeGst: true };

  it("works out the ex-GST price a margin or a markup asks for", () => {
    expect(targetExGstPrice(60, "MARGIN", 40)).toBe(100);
    expect(targetExGstPrice(50, "MARKUP", 100)).toBe(100); // keystone
  });

  it("refuses a margin of 100% or more, which has no finite price", () => {
    expect(() => targetExGstPrice(10, "MARGIN", 100)).toThrow();
  });

  it("rounds up to a price ending, never down into a thinner margin", () => {
    expect(applyRounding(649.23, "0.99")).toBe(649.99);
    expect(applyRounding(649.99, "0.99")).toBe(649.99);
    expect(applyRounding(650.0, "0.99")).toBe(650.99);
    expect(applyRounding(12.3, "0.95")).toBe(12.95);
    expect(applyRounding(12.96, "0.95")).toBe(13.95);
    expect(applyRounding(12.01, "1.00")).toBe(13);
    expect(applyRounding(12.0, "1.00")).toBe(12);
    expect(applyRounding(101, "5.00")).toBe(105);
    expect(applyRounding(101.456, "NONE")).toBe(101.46);
  });

  it("adds GST when the storefront shows GST-inclusive prices", () => {
    expect(retailFor(300, "MARGIN", 40, "NONE", settings)).toBe(550);
    expect(retailFor(300, "MARGIN", 40, "NONE", { ...settings, pricesIncludeGst: false })).toBe(500);
  });

  it("is reachable from the calculator and nowhere else", async () => {
    // The whole point of the file: a margin cannot price a product, only answer a question about
    // one. If this ever fails, the rules have crept back into the import path.
    const { readFileSync, readdirSync } = await import("node:fs");
    const engine = readFileSync(new URL("./pricing.ts", import.meta.url), "utf8");
    expect(engine).not.toContain("calculator");
    const importers = readdirSync(new URL(".", import.meta.url))
      .filter((f) => f.endsWith(".ts") && !f.startsWith("calculator"))
      .filter((f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8").includes('from "./calculator"'));
    expect(importers).toEqual([]);
  });
});
