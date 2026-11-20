import { describe, expect, it } from "vitest";
import { inferTitleGrammar } from "./title-grammar";

describe("titles by example", () => {
  it("reads the brand, the year, the gender and the case off three titles", () => {
    const g = inferTitleGrammar([
      { title: "Osprey Talon 22 2026", vendor: "Osprey", productType: "Backpacks" },
      { title: "Osprey Tempest 20 2026", vendor: "Osprey", productType: "Backpacks" },
      { title: "Deuter Speed Lite 21 2026", vendor: "Deuter", productType: "Backpacks" },
    ])!;
    expect(g.naming).toEqual({ brandInTitle: "always", season: "always", audience: "none", casing: "shop", example: "Osprey Talon 22 2026" });
    expect(g.typeFormat).toEqual({ type: "Backpacks", format: "Osprey Talon 22 2026" });
    expect(g.sentence).toBe('From these 3 titles: titles start with the brand, end with the model year, say the gender in the tags, not the title, are written in mixed case; Backpacks titles read like "Osprey Talon 22 2026".');
  });
  it("finds a leading brand among the shop's brands, and says a thin reading is thin", () => {
    const g = inferTitleGrammar([{ title: "Men's Beta Jacket" }, { title: "WOMEN'S ALPHA SV" }], ["Arc'teryx"])!;
    expect(g.naming.brandInTitle).toBe("never");
    expect(g.naming.audience).toBe("front");
    expect(g.naming.season).toBe("never");
    expect(g.naming.casing).toBe("shop");
    expect(g.sentence).toContain("Three or more titles read more surely.");
    expect(inferTitleGrammar([{ title: "Arc'teryx Beta" }], ["Arc'teryx"])!.naming.brandInTitle).toBe("always");
    expect(inferTitleGrammar([{ title: "  " }])).toBeNull();
  });
});
