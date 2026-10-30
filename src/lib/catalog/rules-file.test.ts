import { describe, expect, it } from "vitest";
import { cleanRulesFile, describeRulesFile, RULES_FILE_KIND } from "./rules-file";
import { DEFAULT_HOUSE } from "./house";

describe("a rules file", () => {
  it("is refused unless it says what it is", () => {
    expect(cleanRulesFile(null)).toBeNull();
    expect(cleanRulesFile({ tagRules: [] })).toBeNull();
    expect(cleanRulesFile({ kind: RULES_FILE_KIND })).toMatchObject({ kind: RULES_FILE_KIND, version: 1 });
  });

  it("keeps only the sections it carries, each made safe", () => {
    const f = cleanRulesFile({
      kind: RULES_FILE_KIND, version: 1, shop: "Alpine Edge", exportedAt: "2026-10-30",
      house: { ...DEFAULT_HOUSE, naming: { ...DEFAULT_HOUSE.naming, brandInTitle: "always" }, kinds: [{ type: "Skis", calledAs: "Alpine Skis", tags: ["ski"], titleFormat: "", count: 3 }] },
      tagRules: [{ name: "Burton", matchField: "brand", pattern: "Burton", addTags: "snowboard", active: false }, { pattern: "" }],
      pricingRules: [{ name: "Trek", scope: "BRAND", matchValue: "Trek", mode: "MARGIN", percent: 40, roundTo: "0.99" }, { scope: "BRAND", matchValue: "x", mode: "MARGIN", percent: 120 }],
      settings: { seoTitlePattern: "{brand} {title}", minMarginPct: 150, packages: { drillMountFee: 59, systemMountFee: 49, fittingMount: "Mounted", fittingNoMount: "Flat" } },
      packageParts: [{ name: "Marker Griffon", rrp: 459.99, cost: 241 }, { name: "", rrp: 1 }],
    })!;
    expect(f.house?.naming.brandInTitle).toBe("always");
    expect(f.house?.kinds[0]).toMatchObject({ type: "Skis", calledAs: "Alpine Skis" });
    expect(f.tagRules).toHaveLength(1);
    expect(f.tagRules?.[0]).toMatchObject({ matchField: "brand", addTags: "snowboard", active: false, setMetafields: "{}" });
    // A margin of 120% is no rule.
    expect(f.pricingRules).toHaveLength(1);
    expect(f.settings).toEqual({ seoTitlePattern: "{brand} {title}", minMarginPct: 100, packages: { drillMountFee: 59, systemMountFee: 49, fittingMount: "Mounted", fittingNoMount: "Flat" } });
    expect(f.packageParts).toEqual([{ name: "Marker Griffon", rrp: 459.99, cost: 241 }]);
    expect(f.templates).toBeUndefined();
    expect(f.learned).toBeUndefined();
    expect(describeRulesFile(f)).toBe("listing habits and 1 product type, 1 tag rule, 1 pricing rule, writer settings, 1 package part");
  });

  it("tells an export set to nothing from one left out", () => {
    const f = cleanRulesFile({ kind: RULES_FILE_KIND, learned: null, website: null })!;
    expect(f.learned).toBeNull();
    expect(f.website).toBeNull();
    expect(describeRulesFile(f)).toBe("nothing");
  });
});
