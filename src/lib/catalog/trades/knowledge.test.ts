import { afterEach, describe, expect, it } from "vitest";
import { checkPack, categoryNamed } from "./knowledge";
import { BIKE_PACK } from "./bike";
import pack from "./packs/bike/pack.json";
import kinds from "./packs/bike/kinds.json";
import sizes from "./packs/bike/sizes.json";
import { ALPSPORT_CONVENTIONS, BLANK_CONVENTIONS, activateConventions, categoryForKind, resolveType } from "../taxonomy";
import { colourName } from "../colour";
import { groupLineItems } from "../grouping";
import { emptyLineItem } from "../types";
import { sizeRanker } from "../size-order";

afterEach(() => activateConventions(ALPSPORT_CONVENTIONS));

describe("a trade pack from files", () => {
  it("loads the bike pack, every kind placed in Shopify's taxonomy, and says it is not verified yet", () => {
    expect(checkPack({ pack, kinds, sizes })).toEqual([]);
    expect(BIKE_PACK.knowledge?.verified).toBe(false);
    expect(categoryNamed("Sporting Goods > Outdoor Recreation > Cycling > Bicycles > Gravel Bikes")?.id).toBe("sg-4-4-3-16");
  });

  it("says plainly what is wrong with a pack that does not hold together", () => {
    const bad = { ...pack, shopifyTaxonomy: { ...pack.shopifyTaxonomy, "Gravel Bikes": "Not > A > Category", Unicycles: "sg-4-4-8" } };
    const problems = checkPack({ pack: bad, kinds: [...kinds, { kind: "Unicycles", options: [{ name: "Size", system: "unicycle-size" }] }], sizes });
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/"Not > A > Category" \(for Gravel Bikes\) is not a Shopify category/),
      expect.stringMatching(/"Unicycles" is not on pack.json's menu/),
      expect.stringMatching(/size system "unicycle-size", which sizes.json does not define/),
    ]));
    expect(checkPack({ pack: { name: "No id" } })[0]).toMatch(/^pack.json: /);
  });
});

describe("a bike shop's pack, at work", () => {
  const bikeShop = () => activateConventions({ ...BLANK_CONVENTIONS, pack: "bike" });

  it("knows what suppliers call a kind, the trade's colour shorthand and each kind's Shopify category", () => {
    bikeShop();
    expect(resolveType("FS")).toBe("Full Suspension Mountain Bikes");
    expect(resolveType("TLR")).toBe("Tyres");
    expect(colourName("GRY")).toBe("Grey");
    expect(categoryForKind("Dropper Posts")?.path).toBe("Sporting Goods > Outdoor Recreation > Cycling > Bicycle Parts > Bicycle Seatposts");
    activateConventions(ALPSPORT_CONVENTIONS);
    expect(colourName("GRY")).toBe("Gray");
  });

  it("puts sizes in the trade's order, whatever order the invoice printed them in, colours kept together", () => {
    bikeShop();
    const rule = { category: "apparel", pattern: "jersey", productType: "Jerseys", collections: "", tags: "", priority: 1, active: true };
    const line = (sku: string, colour: string, size: string) => ({ ...emptyLineItem(), brand: "Velo", title: "Trail Jersey", sku, colour, size, quantity: 1 });
    const [p] = groupLineItems([line("J1", "Black", "XL"), line("J2", "Black", "S"), line("J3", "Red", "M"), line("J4", "Black", "M"), line("J5", "Red", "S")], [rule]);
    expect(p.variants.map((v) => `${v.option1Value} ${v.option2Value}`)).toEqual(["Black S", "Black M", "Black XL", "Red S", "Red M"]);
  });

  it("reads a size the way the trade writes it", () => {
    const rank = sizeRanker(['29"', "27.5", "650b"], BIKE_PACK.knowledge!.sizes)!;
    expect(rank("27.5")).toBeLessThan(rank('29"'));
    expect(sizeRanker(["Regular", "Long"], BIKE_PACK.knowledge!.sizes)).toBeNull();
  });
});
