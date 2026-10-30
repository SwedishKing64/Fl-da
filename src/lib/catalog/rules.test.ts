import { describe, expect, it } from "vitest";
import { applyTagRules, compilePattern, DEFAULT_TAG_RULES, ruleMatches, type RuleTarget, type TagRuleLike } from "./rules";

/** Rules a ski shop might write on Teach Flöda; none ships with Flöda. */
const rules: TagRuleLike[] = [
  { name: "Women's products", matchField: "any", pattern: String.raw`\b(women'?s|womens|wmns|w'?s|ladies|female)\b`, addTags: "womens", addCollections: "Womens", setProductType: "", setMetafields: JSON.stringify({ gender: "Womens" }), priority: 50, active: true },
  { name: "New season", matchField: "any", pattern: String.raw`\b20(2[6-9]|3[0-9])\b`, addTags: "", addCollections: "New Arrivals", setProductType: "", setMetafields: "{}", priority: 10, active: true },
  { name: "Snowboard bindings (not ski)", matchField: "any", pattern: String.raw`\b(cartel|malavita|genesis|union|flux|snowboard binding)`, addTags: "snowboard-bindings", addCollections: "Snowboard Bindings", setProductType: "Snowboard Bindings", setMetafields: "{}", priority: 70, active: true },
].map((r, i) => ({ ...r, id: `r${i}` }));
const base: RuleTarget = { title: "Atomic Bent 90 Skis", vendor: "Atomic", category: "skis", productType: "Skis", skus: ["AA0029-172"], tags: ["skis", "Atomic", "2026"], collections: ["Skis"], metafields: {} };

describe("tag rules", () => {
  it("adds tags, collections and metafields from matching rules, keeping existing ones", () => {
    const out = applyTagRules({ ...base, title: "Atomic Bent 90 W Skis Womens" }, rules);
    // A tag is added as the rule spells it; the New season rule contributes its collection only.
    expect(out.tags).toEqual(expect.arrayContaining(["skis", "Atomic", "2026", "womens"]));
    expect(out.tags).not.toContain("Womens");
    expect(out.tags).not.toContain("New Season");
    // Collections are a different column and keep the shop's title case.
    expect(out.collections).toEqual(expect.arrayContaining(["Skis", "Womens", "New Arrivals"]));
    expect(out.metafields.gender).toBe("Womens");
    expect(out.productType).toBe("Skis");
    expect(out.matched.map((m) => m.name)).toContain("Women's products");
  });

  it("applies higher priority rules first and lets them set the product type", () => {
    const out = applyTagRules({ ...base, title: "Burton Cartel Bindings", category: "bindings", productType: "Ski Bindings" }, rules);
    expect(out.productType).toBe("Snowboard Bindings");
    // The Type is title case; the tag is the shop's hyphenated shelf, on 40 of its products.
    expect(out.tags).toContain("snowboard-bindings");
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

  it("ships with no rules at all: a shop writes its own", () => {
    expect(DEFAULT_TAG_RULES).toEqual([]);
  });
});

describe("when two rules disagree", () => {
  const specific = { id: "a", name: "Womens skis", matchField: "any", pattern: "womens", addTags: "womens", addCollections: "", setProductType: "Womens Skis", setMetafields: { gender: "Womens" }, priority: 90, active: true };
  const general = { id: "b", name: "Anything with skis", matchField: "any", pattern: "skis", addTags: "skis", addCollections: "", setProductType: "Skis", setMetafields: { gender: "Unisex", terrain: "All-Mountain" }, priority: 10, active: true };
  const product = { title: "Womens Skis 2026", vendor: "Volkl", category: "skis", productType: "", skus: [], tags: [], collections: [], metafields: {} };

  /** It used to be the other way round: the least important rule had the final say. */
  it("gives the more important rule the answer", () => {
    const out = applyTagRules(product, [general, specific]);
    expect(out.productType).toBe("Womens Skis");
    expect(out.metafields.gender).toBe("Womens");
  });

  it("still lets the less important rule fill in what the first left alone", () => {
    const out = applyTagRules(product, [general, specific]);
    expect(out.metafields.terrain).toBe("All-Mountain");
  });

  /** Two rules adding tags both get their way, whatever order they are in. */
  it("adds up every tag regardless of order", () => {
    const a = applyTagRules(product, [specific, general]).tags.sort();
    const b = applyTagRules(product, [general, specific]).tags.sort();
    expect(a).toEqual(["skis", "womens"]);
    expect(a).toEqual(b);
  });

  it("leaves a product alone when nothing matches", () => {
    // "any" reads every field, so the sample has to be clear of the word entirely.
    const out = applyTagRules({ ...product, title: "Hornet 1P Tent", category: "tents" }, [specific, general]);
    expect(out.matched).toEqual([]);
    expect(out.productType).toBe("");
  });
});
