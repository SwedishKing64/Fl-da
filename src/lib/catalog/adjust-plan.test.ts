/**
 * Grounding a buyer's sheet against what the loaded exports really contain.
 *
 * The vocabulary below is taken from the shop's own Shopify exports. The sheet and the export do
 * not agree on where a category lives — "Snowboard Bindings" is a Type, "ski-helmets" is a tag —
 * nor on how it is spelled, and the gap between them is where a row about bindings turns into a
 * change to every ski of that year.
 */

import { describe, expect, it } from "vitest";
import { describePlan, groundScope, mapWithConcurrency, respellAddedTags } from "./adjust-plan";

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
  fitting: "flat" | "package" | "";
}
const EMPTY: RawScope = { vendors: [], types: [], tags: [], anyTags: [], excludeTags: [], excludeVendors: [], handles: [], titleContains: "", fitting: "" };
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


describe("describePlan", () => {
  it("says in plain words what a title or stock change will do, and what it will not", () => {
    const lines = describePlan({
      scope: { vendors: ["Burton"] },
      operations: [
        { kind: "setTitleYear", year: "2027" },
        { kind: "renameTitle", find: "Griffon Demo", replace: "Griffon 13" },
        { kind: "renameTitle", find: " EX DEMO", replace: "" },
        { kind: "setQuantity", value: 0 },
        { kind: "setCost", value: 450 },
        { kind: "changeCost", percent: -7.5 },
      ],
    });
    expect(lines.find((l) => l.includes("cost per item to $450.00"))).toBeTruthy();
    expect(lines.find((l) => l.includes("Bring the cost per item down by 7.5%"))).toBeTruthy();
    expect(lines[0]).toContain("vendor is Burton");
    expect(lines[1]).toContain("2027");
    // The URL is the thing a person will assume moved with the title. Every title line says it.
    expect(lines.filter((l) => l.includes("The URL does not change."))).toHaveLength(3);
    expect(lines[3]).toBe('Remove " EX DEMO" from the product title. The URL does not change.');
    expect(lines[4]).toBe("Set the stock on hand to 0.");
  });
});

/**
 * A brands cell holds brands, plural, with nothing between them.
 *
 * "Dalbello Head" was matched whole against the vendor list, found nothing, and the row was blocked
 * — two brands asked for and neither changed. Splitting on spaces alone would be worse: seven of
 * the shop's thirty-eight vendors are two words, and "Black Crows" is not "Black" and "Crows".
 */
describe("a brands cell with more than one brand in it", () => {
  const SHOP = { vendors: ["Head", "Dalbello", "Atomic", "K2", "Burton", "Black Crows", "Black Diamond", "Helly Hansen", "Oakley"], types: ["Skis", "Ski Boots"], tags: ["2026", "2027"] };

  it("splits two brands written side by side", () => {
    expect(groundScope(scopeOf({ vendors: ["Dalbello Head"] }), SHOP).scope.vendors).toEqual(["Dalbello", "Head"]);
    expect(groundScope(scopeOf({ vendors: ["K2 burton"] }), SHOP).scope.vendors).toEqual(["K2", "Burton"]);
  });

  it("keeps a two-word brand whole, and reads the shop's hyphen as its space", () => {
    expect(groundScope(scopeOf({ vendors: ["black crows"] }), SHOP).scope.vendors).toEqual(["Black Crows"]);
    expect(groundScope(scopeOf({ vendors: ["black-crows"] }), SHOP).scope.vendors).toEqual(["Black Crows"]);
    // Longest run first: Black Crows and Black Diamond share a first word and are two brands.
    expect(groundScope(scopeOf({ vendors: ["black-crows black-diamond"] }), SHOP).scope.vendors).toEqual(["Black Crows", "Black Diamond"]);
  });

  it("passes over the words that are not brands, and says it did", () => {
    const r = groundScope(scopeOf({ vendors: ["helly hansen mens only"] }), SHOP);
    expect(r.scope.vendors).toEqual(["Helly Hansen"]);
    expect(r.dropped.join(" ")).toContain("matches no brand");
  });

  it("names a brand the loaded files do not have, rather than acting as if it was read", () => {
    // Their sheet says Dalbello Head, and a ski-only export has Head in it but no Dalbello.
    const r = groundScope(scopeOf({ vendors: ["Dalbello Head"] }), { ...SHOP, vendors: ["Head"] });
    expect(r.scope.vendors).toEqual(["Head"]);
    expect(r.dropped.join(" ")).toContain("the rest of it matches no brand");
  });

  it("still blocks a cell with no brand in it at all, rather than dropping the condition", () => {
    // "2999 is selected A\T +selected look" is a note. Run without a brand it would be every 2999
    // binding in the shop, which is not what the row says.
    const r = groundScope(scopeOf({ vendors: ["all alpine touring"], anyTags: ["2026"] }), SHOP);
    expect(r.scope.vendors).toBeUndefined();
    expect(r.blocked.length).toBeGreaterThan(0);
  });

  it("splits an exclusion the same way", () => {
    expect(groundScope(scopeOf({ types: ["Ski Boots"], excludeVendors: ["Dalbello Head"] }), SHOP).scope.excludeVendors).toEqual(["Dalbello", "Head"]);
  });
});

/**
 * "Add the tag snow sale" added "snwo sale", every time.
 *
 * The loaded export carried the typo on a product or two, and the reader had been told to prefer
 * the file's spelling "when the file has something close". A catalogue's typo is not a spelling.
 */
describe("a tag to add keeps the spelling it was asked for", () => {
  const ask = "for all products add the tag snow sale";
  const add = (tags: string[]) => [{ kind: "addTags" as const, tags }];

  it("puts a typo the reader copied from the file back to the instruction's spelling", () => {
    expect(respellAddedTags(add(["snwo sale"]), ask, ["snwo sale", "clearance"])).toEqual(add(["snow sale"]));
  });

  it("leaves the tag alone when it is the instruction's own word", () => {
    expect(respellAddedTags(add(["snow sale"]), ask, ["snwo sale"])).toEqual(add(["snow sale"]));
  });

  it("still writes it the shop's way where only the hyphen differs", () => {
    expect(respellAddedTags(add(["snow sale"]), ask, ["snow-sale"])).toEqual(add(["snow sale"]));
    expect(respellAddedTags(add(["snwo-sale"]), ask, ["snow-sale"])).toEqual(add(["snow-sale"]));
  });

  it("does not touch a tag that is nothing like anything the instruction said", () => {
    // A tag from the sheet's own tag column, or one the reader added for a stated reason.
    expect(respellAddedTags(add(["clearance"]), ask, [])).toEqual(add(["clearance"]));
  });

  it("does not turn one real tag into a different real tag", () => {
    // "snow sale" and "snow sales" are within reach of each other; only the one asked for is kept.
    expect(respellAddedTags(add(["snow sales"]), ask, ["snow sales"])).toEqual(add(["snow sale"]));
  });
});

describe("the mounting charge, described", () => {
  it("says which packages and how the sale is kept", () => {
    const lines = describePlan({ scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, bindings: "drill" }] });
    expect(lines.join(" ")).toMatch(/mounting charge to \$59\.00 on packages whose binding is drilled on/);
    expect(lines.join(" ")).toMatch(/a sale stays the sale it was/);
  });
});
