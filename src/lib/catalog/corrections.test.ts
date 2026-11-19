import { afterEach, describe, expect, it } from "vitest";
import { activateCorrections, correctedOptionName, correctedProductType, noteCorrection, type Correction } from "./corrections";
import { groupLineItems } from "./grouping";
import { emptyLineItem } from "./types";
import { SNOW_TEST_CONVENTIONS, BLANK_CONVENTIONS, activateConventions } from "./taxonomy";

afterEach(() => { activateCorrections([]); activateConventions(SNOW_TEST_CONVENTIONS); });

describe("a correction made once", () => {
  it("is kept, counted when made again, and undone by its reverse", () => {
    let list: Correction[] = [];
    list = noteCorrection(list, { kind: "option-name", scope: "Hiking Packs", from: "Option", to: "Volume", brand: "Osprey" });
    list = noteCorrection(list, { kind: "option-name", scope: "Hiking Packs", from: "option", to: "Volume", brand: "Deuter" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ to: "Volume", count: 2, brands: ["Osprey", "Deuter"] });
    list = noteCorrection(list, { kind: "option-name", scope: "Hiking Packs", from: "Volume", to: "Option", brand: "Osprey" });
    expect(list.filter((c) => c.from === "Option")).toHaveLength(0);
    expect(noteCorrection([], { kind: "product-type", scope: "", from: "Packs", to: "packs", brand: "" })).toEqual([]);
  });

  it("renames that kind's option, and only that kind's", () => {
    const list = noteCorrection([], { kind: "option-name", scope: "Hiking Packs", from: "Option", to: "Volume", brand: "Osprey" });
    expect(correctedOptionName("Hiking Packs", "Option", list)).toBe("Volume");
    expect(correctedOptionName("Tents", "Option", list)).toBe("Option");
  });

  it("changes the brand's Type, and every brand's once two brands have had it", () => {
    let list = noteCorrection([], { kind: "product-type", scope: "", from: "Accessories", to: "Climbing Accessories", brand: "Black Diamond" });
    expect(correctedProductType("Accessories", "Black Diamond", list)).toBe("Climbing Accessories");
    expect(correctedProductType("Accessories", "Petzl", list)).toBe("Accessories");
    list = noteCorrection(list, { kind: "product-type", scope: "", from: "Accessories", to: "Climbing Accessories", brand: "Petzl" });
    expect(correctedProductType("Accessories", "Edelrid", list)).toBe("Climbing Accessories");
  });

  it("is what the next build does on its own", () => {
    activateConventions({ ...BLANK_CONVENTIONS, pack: "outdoor" });
    activateCorrections(noteCorrection(noteCorrection([], { kind: "product-type", scope: "", from: "Accessories", to: "Climbing Accessories", brand: "Black Diamond" }),
      { kind: "option-name", scope: "Climbing Accessories", from: "Size", to: "Length", brand: "Black Diamond" }));
    const rule = { category: "accessories", pattern: "sling", productType: "Accessories", collections: "", tags: "", priority: 1, active: true };
    const line = (sku: string, size: string) => ({ ...emptyLineItem(), brand: "Black Diamond", title: "Dynex Runner Sling", sku, size, quantity: 1 });
    const [p] = groupLineItems([line("S60", "60cm"), line("S120", "120cm")], [rule]);
    expect(p.productType).toBe("Climbing Accessories");
    expect(p.option1Name).toBe("Length");
  });
});
