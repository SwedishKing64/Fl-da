import { describe, expect, it } from "vitest";
import { cleanHouse, cleanKinds, conventionGrams, conventionIdentifiers, DEFAULT_HOUSE, describeHouse, houseGuidance, type HouseConventions } from "./house";

const withWeights = (weights: Partial<HouseConventions["weights"]>): HouseConventions => ({ ...DEFAULT_HOUSE, weights: { ...DEFAULT_HOUSE.weights, ...weights } });
const withIds = (identifiers: Partial<HouseConventions["identifiers"]>): HouseConventions => ({ ...DEFAULT_HOUSE, identifiers: { ...DEFAULT_HOUSE.identifiers, ...identifiers } });

describe("weights by convention", () => {
  it("sets nothing by default", () => {
    expect(conventionGrams(DEFAULT_HOUSE, "Skis")).toBeNull();
  });
  it("gives every variant the one weight", () => {
    expect(conventionGrams(withWeights({ mode: "fixed", fixedGrams: 500 }), "Anything")).toBe(500);
  });
  it("gives a kind its band, whatever the case, and nothing to a kind without one", () => {
    const house = withWeights({ mode: "byKind", byKind: [{ type: "Skis", grams: 2000 }, { type: "snowboards", grams: 1000 }] });
    expect(conventionGrams(house, "skis")).toBe(2000);
    expect(conventionGrams(house, "Snowboards")).toBe(1000);
    expect(conventionGrams(house, "Jackets")).toBeNull();
  });
});

describe("identifiers by convention", () => {
  const given = { sku: " ABC-1 ", barcode: "4006381333931" };
  it("keeps the supplier's code and the barcode by default", () => {
    expect(conventionIdentifiers(DEFAULT_HOUSE, given)).toEqual({ sku: "ABC-1", barcode: "4006381333931" });
  });
  it("uses the barcode as the SKU when the shop does, and the code when there is no barcode", () => {
    expect(conventionIdentifiers(withIds({ sku: "barcode" }), given).sku).toBe("4006381333931");
    expect(conventionIdentifiers(withIds({ sku: "barcode" }), { sku: "ABC-1", barcode: "" }).sku).toBe("ABC-1");
  });
  it("writes nothing the shop does not use", () => {
    expect(conventionIdentifiers(withIds({ sku: "none", barcode: "none" }), given)).toEqual({ sku: "", barcode: "" });
  });
});

describe("cleaning what the form sends", () => {
  it("falls back to the plainest reading on anything odd", () => {
    const house = cleanHouse({ naming: { brandInTitle: "sometimes" as never, season: "never", casing: "shop", audience: "front", example: "  Mantra 88  " }, weights: { mode: "byKind", unit: "kg", fixedGrams: -4, byKind: [{ type: " Skis ", grams: 2000.4 }, { type: "", grams: 9 }] }, notes: "x".repeat(5000) } as Partial<HouseConventions>);
    expect(house.naming.brandInTitle).toBe("never");
    expect(house.naming.season).toBe("never");
    expect(house.naming.example).toBe("Mantra 88");
    expect(house.weights.fixedGrams).toBe(0);
    expect(house.weights.byKind).toEqual([{ type: "Skis", grams: 2000 }]);
    expect(house.notes).toHaveLength(4000);
    expect(house.identifiers).toEqual(DEFAULT_HOUSE.identifiers);
  });
  it("accepts nothing at all", () => {
    expect(cleanHouse(null)).toEqual(DEFAULT_HOUSE);
  });
});

describe("what the reader is told", () => {
  it("says only what differs from the plainest reading, and the notes whole", () => {
    const text = houseGuidance({ ...DEFAULT_HOUSE, naming: { ...DEFAULT_HOUSE.naming, brandInTitle: "always", example: "Völkl Mantra 88" }, notes: "Never mention the RRP." });
    expect(text).toContain("lead with the brand");
    expect(text).toContain('"Völkl Mantra 88"');
    expect(text).toContain("Never mention the RRP.");
    expect(text).not.toContain("model year");
  });
  it("describes the conventions in plain words", () => {
    const lines = describeHouse(withWeights({ mode: "byKind", unit: "kg", byKind: [{ type: "Skis", grams: 2000 }] }));
    expect(lines.join(" ")).toContain("Skis 2 kg");
    expect(lines.join(" ")).toContain("the supplier's code");
  });
});

describe("the kinds of product the shop names", () => {
  it("keeps one row per export Type, the name defaulting to the Type, tags split and trimmed", () => {
    const kinds = cleanKinds([
      { type: " Skis ", calledAs: "", tags: "ski, ski-gear, , ski", titleFormat: " Völkl Mantra 88 2026 ", count: 12.4 },
      { type: "skis", calledAs: "Alpine Skis", tags: ["x"], titleFormat: "", count: 1 },
      { type: "Jackets", calledAs: "Outerwear", tags: ["clothing"], titleFormat: "", count: -3 },
      { type: "", calledAs: "Nothing", tags: [], titleFormat: "", count: 0 },
    ]);
    expect(kinds).toEqual([
      { type: "Skis", calledAs: "Skis", tags: ["ski", "ski-gear"], titleFormat: "Völkl Mantra 88 2026", count: 12 },
      { type: "Jackets", calledAs: "Outerwear", tags: ["clothing"], titleFormat: "", count: 0 },
    ]);
    expect(cleanKinds(undefined)).toEqual([]);
  });
  it("tells the reader what each kind is called, its tags and how its titles read", () => {
    const text = houseGuidance({ ...DEFAULT_HOUSE, kinds: [
      { type: "Jackets", calledAs: "Outerwear", tags: ["clothing", "outerwear"], titleFormat: "Patagonia Nano Puff Jacket", count: 40 },
      { type: "Pumps", calledAs: "Pumps", tags: [], titleFormat: "", count: 3 },
    ] });
    expect(text).toContain('Outerwear: the shop files what an export calls "Jackets" as "Outerwear"; every one is tagged clothing, outerwear; its titles read like "Patagonia Nano Puff Jacket".');
    expect(text).not.toContain("Pumps");
  });
  it("keeps the kinds through a clean", () => {
    expect(cleanHouse({ kinds: [{ type: "Skis", calledAs: "Skis", tags: ["ski"], titleFormat: "", count: 2 }] }).kinds).toHaveLength(1);
    expect(cleanHouse(null).kinds).toEqual([]);
  });
});

describe("where a shop that has said nothing starts", () => {
  it("keeps the ski shop's habits for the snow pack, and starts every other shop plain", async () => {
    const { defaultHouseFor } = await import("./house");
    expect(defaultHouseFor("snow-outdoor").naming).toMatchObject({ brandInTitle: "never", audience: "none" });
    expect(defaultHouseFor("general").naming).toMatchObject({ brandInTitle: "always", audience: "none" });
    expect(defaultHouseFor("outdoor").naming).toMatchObject({ brandInTitle: "always", audience: "none" });
  });

  it("fills what a saved form leaves out from the pack's starting point, not the ski shop's", () => {
    const base = cleanHouse(null);
    const plain = { ...base, naming: { ...base.naming, brandInTitle: "always" as const, audience: "none" as const } };
    expect(cleanHouse({ naming: { season: "never" } as never }, plain).naming).toMatchObject({ brandInTitle: "always", audience: "none", season: "never" });
  });
});
