/**
 * Grounding a buyer's sheet against what the loaded exports really contain.
 *
 * The vocabulary below is taken from the shop's own Shopify exports. The sheet and the export do
 * not agree on where a category lives — "Snowboard Bindings" is a Type, "ski-helmets" is a tag —
 * nor on how it is spelled, and the gap between them is where a row about bindings turns into a
 * change to every ski of that year.
 */

import { describe, expect, it } from "vitest";
import { groundScope } from "./adjust-plan";

const FILE = {
  vendors: ["Burton", "Nitro", "Arc'teryx", "Anon", "POC", "Ride"],
  types: ["Skis", "Snowboards", "Snowboard Bindings", "Snowboard Boots", "Ski Accessories", "Snow Clothing"],
  tags: [
    "2024", "2025", "2026", "2027", "2998", "2999",
    "clearance", "snow clearance", "ski-helmets", "ski-gloves", "goggles", "ski poles",
    "snowboard-bindings", "step-on-bindings", "traditional-bindings", "midlayers",
    "alpine touring", "burton", "skis",
  ],
};

const EMPTY = { vendors: [], types: [], tags: [], anyTags: [], excludeTags: [], excludeVendors: [], handles: [], titleContains: "" };
const scopeOf = (over: Partial<typeof EMPTY>) => ({ ...EMPTY, ...over });

describe("groundScope", () => {
  it("keeps a category that really is a Type", () => {
    const { scope, blocked } = groundScope(scopeOf({ types: ["snowboard bindings"], anyTags: ["2026"] }), FILE);
    expect(blocked).toEqual([]);
    expect(scope.types).toEqual(["Snowboard Bindings"]);
    expect(scope.anyTags).toEqual(["2026"]);
  });

  it("falls back to the tag when the shop keeps that category as a tag", () => {
    const { scope, blocked } = groundScope(scopeOf({ types: ["ski helmets"], anyTags: ["2025"] }), FILE);
    expect(blocked).toEqual([]);
    expect(scope.types).toBeUndefined();
    expect(scope.tags).toEqual(["ski-helmets"]);
  });

  it("matches across a hyphen, because the sheet and the export spell it differently", () => {
    const { scope } = groundScope(scopeOf({ tags: ["step on bindings"] }), FILE);
    expect(scope.tags).toEqual(["step-on-bindings"]);
  });

  it("blocks a row whose category is in no loaded file, rather than dropping it", () => {
    // "2999 | ski bindings | clearance" with no ski bindings loaded. Dropping the category leaves
    // "everything tagged 2999", which is every ski, boot and board of that year.
    const { blocked } = groundScope(scopeOf({ types: ["ski bindings"], anyTags: ["2999"] }), FILE);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toContain("ski bindings");
  });

  it("blocks a row whose brand is in no loaded file", () => {
    const { blocked } = groundScope(scopeOf({ vendors: ["Bent Metal"], types: ["snowboard bindings"] }), FILE);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toContain("Bent Metal");
  });

  it("does not block when only some of a list is missing, because that only narrows", () => {
    const { scope, blocked } = groundScope(scopeOf({ anyTags: ["2024", "2025", "2023", "2022"] }), FILE);
    expect(blocked).toEqual([]);
    expect(scope.anyTags).toEqual(["2024", "2025"]);
  });

  it("reads a list of years as any-one-of rather than all-at-once", () => {
    const { scope } = groundScope(scopeOf({ tags: ["2024", "2025", "2026"] }), FILE);
    expect(scope.tags).toBeUndefined();
    expect(scope.anyTags).toEqual(["2024", "2025", "2026"]);
  });

  it("keeps an exclusion the file has never heard of, since excluding nothing is harmless", () => {
    const { scope, blocked } = groundScope(scopeOf({ types: ["snow clothing"], excludeVendors: ["Arc'teryx"], excludeTags: ["discontinued"] }), FILE);
    expect(blocked).toEqual([]);
    expect(scope.excludeTags).toEqual(["discontinued"]);
    expect(scope.excludeVendors).toEqual(["Arc'teryx"]);
  });

  it("carries both the alpine touring and look tags as an all-at-once pair", () => {
    const file = { ...FILE, tags: [...FILE.tags, "look"] };
    const { scope, blocked } = groundScope(scopeOf({ tags: ["alpine touring", "look"], anyTags: ["2999"] }), file);
    expect(blocked).toEqual([]);
    expect(scope.tags).toEqual(["alpine touring", "look"]);
    expect(scope.anyTags).toEqual(["2999"]);
  });
});
