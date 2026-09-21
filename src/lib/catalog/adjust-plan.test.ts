/**
 * Grounding a buyer's sheet against what the loaded exports really contain.
 *
 * The vocabulary below is taken from the shop's own Shopify exports. The sheet and the export do
 * not agree on where a category lives — "Snowboard Bindings" is a Type, "ski-helmets" is a tag —
 * nor on how it is spelled, and the gap between them is where a row about bindings turns into a
 * change to every ski of that year.
 */

import { describe, expect, it } from "vitest";
import { groundScope, mapWithConcurrency } from "./adjust-plan";

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

interface RawScope {
  vendors: string[]; types: string[]; tags: string[]; anyTags: string[];
  excludeTags: string[]; excludeVendors: string[]; handles: string[]; titleContains: string;
}
const EMPTY: RawScope = { vendors: [], types: [], tags: [], anyTags: [], excludeTags: [], excludeVendors: [], handles: [], titleContains: "" };
const scopeOf = (over: Partial<RawScope>): RawScope => ({ ...EMPTY, ...over });

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

/**
 * Reading a sheet several rows at a time.
 *
 * Next dispatches server actions one at a time per client, so the whole point of reading a sheet
 * inside one action is that the rows inside it do not queue. These are the three things that has
 * to be true of it: the answers stay with their rows, no more than the limit run at once, and one
 * row that fails is one row that fails.
 */
describe("mapWithConcurrency", () => {
  const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("keeps every answer with the row it came from, however they finish", async () => {
    const out = await mapWithConcurrency(
      [40, 5, 30, 1, 20],
      3,
      async (ms, i) => { await settle(ms); return `${i}:${ms}`; },
      () => "error",
    );
    expect(out).toEqual(["0:40", "1:5", "2:30", "3:1", "4:20"]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async (i) => { running++; peak = Math.max(peak, running); await settle(2); running--; return i; },
      () => -1,
    );
    expect(peak).toBe(4);
  });

  it("starts the next row as soon as one frees up, rather than in blocks", async () => {
    // Nineteen quick rows behind one slow one. Waiting for whole blocks would take as long as the
    // slow row times the number of blocks; a pool overlaps them and finishes in about one.
    const started: number[] = [];
    const t0 = Date.now();
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async (i) => { started.push(i); await settle(i === 0 ? 60 : 1); return i; },
      () => -1,
    );
    expect(Date.now() - t0).toBeLessThan(120);
    expect(started).toHaveLength(20);
  });

  it("keeps one failing row to itself and finishes the rest", async () => {
    const out = await mapWithConcurrency(
      ["a", "boom", "c"],
      2,
      async (v) => { if (v === "boom") throw new Error("could not read this one"); return `ok:${v}`; },
      (err, v) => `failed:${v}:${(err as Error).message}`,
    );
    expect(out).toEqual(["ok:a", "failed:boom:could not read this one", "ok:c"]);
  });

  it("does nothing, and does not hang, on an empty sheet", async () => {
    expect(await mapWithConcurrency([], 8, async () => 1, () => 0)).toEqual([]);
  });
});
