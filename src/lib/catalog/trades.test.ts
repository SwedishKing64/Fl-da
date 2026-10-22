import { afterEach, describe, expect, it } from "vitest";
import { ALPSPORT_CONVENTIONS, BLANK_CONVENTIONS, SNOW_OUTDOOR_TAXONOMY, activateConventions, productTypes } from "./taxonomy";
import { PACKS, PACK_IDS, packFor } from "./trades";

afterEach(() => activateConventions(BLANK_CONVENTIONS));

describe("trade packs", () => {
  it("keeps the snow-and-outdoor menu exactly where the engine found it", () => {
    expect(PACKS["snow-outdoor"].tree).toBe(SNOW_OUTDOOR_TAXONOMY);
    activateConventions(ALPSPORT_CONVENTIONS);
    expect(productTypes()).toContain("Skis");
    expect(productTypes()).toContain("Tents");
  });

  it("gives an outdoor shop the outdoor menu without the snow", () => {
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    const kinds = productTypes();
    expect(kinds).toContain("Tents");
    expect(kinds).toContain("Hiking Boots");
    expect(kinds).toContain("Outdoor Clothing");
    expect(kinds).not.toContain("Skis");
    expect(kinds).not.toContain("Snow Jackets");
    expect(PACKS.outdoor.tagSpelling["2 Person Tents"]).toBe("2 person tents");
    expect(PACKS.outdoor.tagSpelling["Carving Skis"]).toBeUndefined();
  });

  it("knows no kinds at all on a blank shop", () => {
    activateConventions(BLANK_CONVENTIONS);
    expect(productTypes()).toEqual([]);
  });

  it("falls back to no pack for an id it does not know", () => {
    expect(packFor("surfboards").id).toBe("general");
    expect(packFor(undefined).id).toBe("general");
  });

  it("offers every pack at setup, none first, and only the snow pack seeds rules", () => {
    expect(PACK_IDS[0]).toBe("general");
    expect(PACK_IDS.filter((id) => PACKS[id].seeds)).toEqual(["snow-outdoor"]);
  });
});
