import { describe, expect, it } from "vitest";
import { applyTagRules, compilePattern, DEFAULT_TAG_RULES, ruleMatches, type RuleTarget, type TagRuleLike } from "./rules";

const rules: TagRuleLike[] = DEFAULT_TAG_RULES.map((r, i) => ({ ...r, id: `r${i}` }));
const base: RuleTarget = { title: "Atomic Bent 90 Skis", vendor: "Atomic", category: "skis", productType: "Skis", skus: ["AA0029-172"], tags: ["skis", "Atomic", "2026"], collections: ["Skis"], metafields: {} };

describe("tag rules", () => {
  it("adds tags, collections and metafields from matching rules, keeping existing ones", () => {
    const out = applyTagRules({ ...base, title: "Atomic Bent 90 W Skis Womens" }, rules);
    expect(out.tags).toEqual(expect.arrayContaining(["skis", "Atomic", "2026", "Womens", "New Season"]));
    expect(out.collections).toEqual(expect.arrayContaining(["Skis", "Womens", "New Arrivals"]));
    expect(out.metafields.gender).toBe("Womens");
    expect(out.productType).toBe("Skis");
    expect(out.matched.map((m) => m.name)).toContain("Women's products");
  });

  it("applies higher priority rules first and lets them set the product type", () => {
    const out = applyTagRules({ ...base, title: "Burton Cartel Bindings", category: "bindings", productType: "Ski Bindings" }, rules);
    expect(out.productType).toBe("Snowboard Bindings");
    expect(out.tags).toContain("Snowboard Bindings");
  });

  it("matches only the chosen field", () => {
    const rule: TagRuleLike = { id: "x", name: "brand only", matchField: "brand", pattern: "atomic", addTags: "A", addCollections: "", setProductType: "", setMetafields: "{}", priority: 0, active: true };
    expect(ruleMatches(rule, base)).toBe(true);
    expect(ruleMatches(rule, { ...base, vendor: "Volkl" })).toBe(false);
    expect(ruleMatches({ ...rule, active: false }, base)).toBe(false);
  });

  it("treats an invalid regex as literal text", () => {
    expect(compilePattern("100mm (").test("Griffon 100mm (")).toBe(true);
  });
});
