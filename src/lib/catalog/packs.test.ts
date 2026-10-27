import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { emptyLineItem } from "./types";
import { groupLineItems } from "./grouping";
import { litresOf, packShelf } from "./packs";
import { csvType } from "./pipeline-pure";
import type { CanonicalLineItem } from "./types";

const item = (over: Partial<CanonicalLineItem>): CanonicalLineItem => ({ ...emptyLineItem(), ...over });

describe("where a pack is filed", () => {
  it("reads the litres out of the name", () => {
    expect(litresOf("Exos Pro 55")).toBe(55);
    expect(litresOf("Hikelite 26 2026")).toBe(26);
    expect(litresOf("Farpoint 40L")).toBe(40);
    expect(litresOf("Talon Pro 30")).toBe(30);
    expect(litresOf("Daylite")).toBeNull();
    expect(litresOf("Custom Camber 154")).toBeNull();
  });

  it("puts a pack on the shop's shelf by what it is", () => {
    expect(packShelf("Osprey", "Exos Pro 55")).toBe("Hiking Packs");
    expect(packShelf("Osprey", "Women's Eja 48")).toBe("Hiking Packs");
    expect(packShelf("Osprey", "Hikelite 26")).toBe("Daypacks");
    expect(packShelf("Osprey", "Talon Pro 30", "PACKS")).toBe("Daypacks");
    expect(packShelf("Osprey", "Daylite")).toBe("Daypacks");
    expect(packShelf("Osprey", "Farpoint 40")).toBe("Travel Packs");
    expect(packShelf("Osprey", "Transporter 65 Duffel")).toBe("Duffels");
    expect(packShelf("Osprey", "Hydraulics 2L Reservoir")).toBe("Hydration Packs");
    expect(packShelf("Deuter", "Aircontact Core 65+10 Backpack")).toBe("Hiking Packs");
    expect(packShelf("Burton", "Day Hiker 25L Backpack")).toBe("Daypacks");
    // Not packs: a ski bag, a board bag, a boot bag, a ski.
    expect(packShelf("Burton", "Wheelie Gig Board Bag")).toBeNull();
    expect(packShelf("Volkl", "Double Ski Bag 190")).toBeNull();
    expect(packShelf("Salomon", "Boot Bag")).toBeNull();
    expect(packShelf("Volkl", "M7 Mantra 177")).toBeNull();
    expect(packShelf("Osprey", "")).toBeNull();
  });

  it("builds an Osprey order as packs on the Outdoor menu, not as ski accessories", () => {
    const grouped = groupLineItems([
      item({ title: "Exos Pro 55", brand: "Osprey", sku: "10006", colour: "Dale Grey / Agam Blue", size: "L/XL", quantity: 2, costPrice: 252.04, rrp: 499, gender: "Mens", season: "2026", category: "Packs", productType: "Packs" }),
      item({ title: "Hikelite 26", brand: "Osprey", sku: "10040", colour: "Cascade Blue", size: "", quantity: 3, costPrice: 90, rrp: 179, gender: "Unisex", season: "2026", category: "Packs", productType: "Packs" }),
    ], DEFAULT_CATEGORY_RULES);
    const exos = grouped.find((g) => /Exos/.test(g.title))!;
    const hikelite = grouped.find((g) => /Hikelite/.test(g.title))!;
    expect(exos.productType).toBe("Hiking Packs");
    expect(csvType(exos.productType, exos.collections)).toBe("Packs & Bags");
    expect(exos.tags).toEqual(expect.arrayContaining(["hiking packs", "packs-and-bags", "outdoor", "osprey", "mens"]));
    expect(exos.tags.filter((t) => /ski|accessor/.test(t))).toEqual([]);
    expect(hikelite.productType).toBe("Daypacks");
    expect(hikelite.tags).toEqual(expect.arrayContaining(["daypacks", "backpacks", "packs-and-bags", "outdoor"]));
    expect(exos.tags).toContain("backpacks");
  });

  it("files every Dakine bag, and any boot backpack, as a Ski Accessory on the ski and boot bag shelves", () => {
    expect(packShelf("Dakine", "Boot Backpack 50L")).toBeNull();
    expect(packShelf("Dakine", "Heli Pro 20L")).toBeNull();
    expect(packShelf("Salomon", "Boot Pack 45")).toBeNull();
    const grouped = groupLineItems([
      item({ title: "Boot Backpack 50L", brand: "Dakine", sku: "D1", colour: "Black", size: "OS", quantity: 2, costPrice: 80, rrp: 179.99, season: "2026", category: "Bags", productType: "Backpacks" }),
      item({ title: "Heli Pro 20L", brand: "Dakine", sku: "D2", colour: "Black", size: "", quantity: 1, costPrice: 70, rrp: 159.99, season: "2026", category: "Packs", productType: "Packs" }),
    ], DEFAULT_CATEGORY_RULES);
    for (const g of grouped) {
      expect(g.productType).toBe("Ski Accessories");
      expect(g.tags).toEqual(expect.arrayContaining(["ski-and-boot-bags", "snow-bags", "ski-accessories"]));
      expect(g.tags.filter((t) => /hiking|outdoor|daypack|packs-and-bags/.test(t))).toEqual([]);
      expect(g.collections.filter((c) => /pack|boots/i.test(c))).toEqual([]);
    }
    // "OS" on the order is no size: no Size option at all.
    const boot = grouped.find((g) => /Boot Backpack/.test(g.title))!;
    expect([boot.option1Name, boot.option2Name, boot.option3Name]).not.toContain("Size");
    expect(boot.variants.map((v) => v.option1Value)).toEqual(["Black"]);
  });
});
