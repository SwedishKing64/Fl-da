import { afterEach, describe, expect, it } from "vitest";
import { describeLearned, kindsFromListings, learnVocabulary, mergeVocabulary } from "./learn";
import { SNOW_TEST_CONVENTIONS, activateConventions, isValidType, productTypes, resolveType, typeSections } from "./taxonomy";
import { generalTags, isRuleGenerated, tagsFor } from "./tagging";
import type { Listing } from "./shop-memory";

const listing = (handle: string, productType: string, tags: string[], vendor = "Acme"): Listing => ({
  handle, title: handle.replace(/-/g, " "), vendor, productType, tags, price: null, bindingOption: "", barcodes: [],
});

/** A bike shop: nothing in it is in the snow menu. */
function bikeShop(): Listing[] {
  const out: Listing[] = [];
  for (let i = 0; i < 12; i++) out.push(listing(`road-bike-${i}`, "Road Bikes", ["bikes", "road bikes", "2026", "mens", i % 3 === 0 ? "sale" : "trek"], "Trek"));
  for (let i = 0; i < 10; i++) out.push(listing(`mtb-${i}`, "Mountain Bikes", ["bikes", "mountain-bikes", "2026", "giant"], "Giant"));
  for (let i = 0; i < 9; i++) out.push(listing(`helmet-${i}`, "Helmets", ["accessories", "helmets", "Size_M", "giro"], "Giro"));
  for (let i = 0; i < 8; i++) out.push(listing(`pump-${i}`, "Pumps", ["accessories", "pumps", "topeak"], "Topeak"));
  for (let i = 0; i < 6; i++) out.push(listing(`kids-bike-${i}`, "Kids Bikes", ["bikes", "kids bikes", "kids"], "Trek"));
  return out;
}

afterEach(() => activateConventions(SNOW_TEST_CONVENTIONS));

describe("learning a shop's vocabulary from its export", () => {
  const learned = learnVocabulary(bikeShop(), "products_export.csv");

  it("finds every kind of product, most common first", () => {
    expect(learned.types.map((t) => t.type)).toEqual(["Road Bikes", "Mountain Bikes", "Helmets", "Pumps", "Kids Bikes"]);
    expect(learned.products).toBe(45);
  });

  it("reads how each kind's own tag is spelled, spaced or hyphenated", () => {
    expect(learned.spelling["Road Bikes"]).toBe("road bikes");
    expect(learned.spelling["Mountain Bikes"]).toBe("mountain-bikes");
    expect(learned.spelling["Pumps"]).toBe("pumps");
  });

  it("finds the menus: tags on nearly every product of several kinds", () => {
    expect(learned.sections).toEqual(["bikes", "accessories"]);
    expect(learned.types.find((t) => t.type === "Road Bikes")?.sections).toEqual(["bikes"]);
    expect(learned.types.find((t) => t.type === "Helmets")?.sections).toEqual(["accessories"]);
  });

  it("learns nothing from seasons, genders, sizes, sales or brand names", () => {
    const everything = [...learned.sections, ...Object.values(learned.spelling)];
    for (const tag of ["2026", "mens", "kids", "sale", "trek", "size_m"]) expect(everything).not.toContain(tag);
    expect(learned.vendors[0]).toEqual({ name: "Trek", count: 18 });
  });

  it("says what it learned in a few lines", () => {
    const lines = describeLearned(learned);
    expect(lines[0]).toContain("45 products");
    expect(lines[1]).toContain("5 kinds of product");
    expect(lines[2]).toContain("bikes, accessories");
  });
});

describe("the learned vocabulary in force", () => {
  it("makes the shop's kinds valid Types, tagged the way the shop tags them", () => {
    activateConventions({ pack: "general", learned: learnVocabulary(bikeShop()), marker: "" });
    expect(isValidType("Mountain Bikes")).toBe(true);
    expect(resolveType("mountain bikes")).toBe("Mountain Bikes");
    expect(isValidType("Skis")).toBe(false); // not this shop's
    expect(typeSections()["Mountain Bikes"]).toEqual(["bikes"]);
    expect(tagsFor("Mountain Bikes")).toEqual(["mountain-bikes"]);
    expect(tagsFor("Road Bikes")).toEqual(["road bikes"]);
    const tags = generalTags({ type: "Road Bikes", vendor: "Trek", genders: ["mens"], year: 2026 });
    expect(tags).toEqual(["road bikes", "bikes", "2026", "trek", "mens"]);
    expect(isRuleGenerated("bikes")).toBe(true);
  });

  it("writes no marker when the shop has none, and its own when it has", () => {
    activateConventions({ pack: "general", learned: learnVocabulary(bikeShop()), marker: "" });
    expect(generalTags({ type: "Pumps", vendor: "Topeak", genders: [] })).not.toContain("");
    activateConventions({ pack: "general", learned: learnVocabulary(bikeShop()), marker: "BLT" });
    expect(generalTags({ type: "Pumps", vendor: "Topeak", genders: [], year: 2026 })).toContain("blt");
    expect(isRuleGenerated("blt-ab")).toBe(true);
  });

  it("adds a learned kind on top of the snow pack without losing the pack", () => {
    activateConventions({ pack: "snow-outdoor", learned: learnVocabulary([...bikeShop(), listing("x-ski", "Skis", ["skis", "ski"], "Volkl")]), marker: "123abc" });
    expect(productTypes()).toContain("Skis");
    expect(productTypes()).toContain("Road Bikes");
    expect(resolveType("Snowboard Boots")).toBe("Snowboard Boots");
  });

  it("is blank on a fresh install", () => {
    activateConventions({ pack: "general", learned: null, marker: "" });
    expect(productTypes()).toEqual([]);
    expect(isValidType("Skis")).toBe(false);
  });
});

describe("one export at a time", () => {
  it("joins two exports' readings: counts kept at the larger, sections united, files named together", () => {
    const bikes = learnVocabulary(bikeShop().filter((l) => l.productType.endsWith("Bikes")), "bikes.csv");
    const rest = learnVocabulary(bikeShop().filter((l) => !l.productType.endsWith("Bikes")), "accessories.csv");
    const both = mergeVocabulary(bikes, rest);
    expect(both.types.map((t) => t.type).sort()).toEqual(["Helmets", "Kids Bikes", "Mountain Bikes", "Pumps", "Road Bikes"]);
    expect(both.file).toBe("bikes.csv + accessories.csv");
    expect(both.products).toBe(bikes.products + rest.products);
    expect(both.vendors.find((v) => v.name === "Trek")?.count).toBe(18);
  });
  it("reads the same file again in place of its earlier self, not on top of it", () => {
    const once = learnVocabulary(bikeShop(), "products_export.csv");
    const again = mergeVocabulary(once, learnVocabulary(bikeShop(), "products_export.csv"));
    expect(again.products).toBe(once.products);
    expect(again.file).toBe("products_export.csv");
    expect(again.types.find((t) => t.type === "Road Bikes")?.count).toBe(12);
  });
});

describe("the kinds an export shows", () => {
  it("lists each kind biggest first with the tags most of its rows carry, vendors and years left out", () => {
    const kinds = kindsFromListings(bikeShop());
    expect(kinds.map((k) => k.type)).toEqual(["Road Bikes", "Mountain Bikes", "Helmets", "Pumps", "Kids Bikes"]);
    const road = kinds[0];
    expect(road.count).toBe(12);
    expect(road.commonTags).toEqual(["bikes", "road bikes"]); // not 2026, mens, sale or trek
    expect(road.vendors).toEqual(["Trek"]);
    expect(road.exampleTitle).toMatch(/^road bike \d+$/);
    expect(kinds[2].commonTags).toEqual(["accessories", "helmets", "Size_M"]);
  });
  it("keeps tags that differ from one product to the next out of the tags every one gets", () => {
    const skis: Listing[] = [];
    for (let i = 0; i < 10; i++) skis.push(listing(`ski-${i}`, "Skis", ["skis", i < 7 ? "all-mountain" : "freeride", ...(i < 4 ? ["carving"] : [])], i % 2 ? "Atomic" : "Volkl"));
    const [type] = kindsFromListings(skis);
    expect(type.commonTags).toEqual(["skis"]);
    expect(type.variesTags).toEqual(["all-mountain", "carving", "freeride"]);
  });
  it("skips rows with no Type", () => {
    expect(kindsFromListings([listing("a", "", ["x"]), listing("b", "Pumps", ["pumps"])]).map((k) => k.type)).toEqual(["Pumps"]);
  });
});

describe("which titles carry the model year", () => {
  it("is every product with a year tag, or only the product types and tags the shop chose", async () => {
    const { titleYear } = await import("./titles");
    expect(titleYear(["skis", "2026"], "Skis")).toBe("2026");
    activateConventions({ ...SNOW_TEST_CONVENTIONS, house: { ...SNOW_TEST_CONVENTIONS.house!, naming: { ...SNOW_TEST_CONVENTIONS.house!.naming, season: "chosen", yearOn: { types: ["Ski Boots"], tags: ["snow"] } } } });
    expect(titleYear(["snow", "2026"], "Jackets")).toBe("2026");
    expect(titleYear(["2026"], "ski boots")).toBe("2026");
    expect(titleYear(["camping", "2026"], "Tents")).toBeNull();
    expect(titleYear(["snow"], "Jackets")).toBeNull();
  });
});
