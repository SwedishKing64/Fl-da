/**
 * Rossignol's race skis arrive already mounted: "HERO FIS GS FAC SPX15". The binding is on the end
 * of the name, and it is a binding — so the ski is a package, named the way the shop names every
 * package: the ski, its season, "inc", the binding, "Binding Package".
 *
 * Reported from an export: "Hero Fis GS Fac Spx15 2026". The SPX is a binding, so the title has to
 * say inc, and Binding Package.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { groupLineItems } from "./grouping";
import { integratedBinding, packageProducts } from "./packages";
import { emptyLineItem, type CanonicalLineItem } from "./types";

const line = (title: string, length: string, over: Partial<CanonicalLineItem> = {}): CanonicalLineItem => ({
  ...emptyLineItem(), title, brand: "Rossignol", length, season: "2026", category: "skis", quantity: 1, costPrice: 1534.09, rrp: 2700, gender: "MENS", ...over,
});

describe("a ski sold with its binding", () => {
  it("names the binding, with inc and Binding Package, season before inc", () => {
    expect(integratedBinding("HERO FIS GS FAC SPX15", "2026")?.title).toBe("Hero FIS GS Fac 2026 inc SPX 15 Binding Package");
    expect(integratedBinding("Hero Fis GS Fac Spx15", "2026")?.binding).toBe("SPX 15");
    expect(integratedBinding("HERO GS PRO R21 NX7", "2026")?.title).toBe("Hero GS Pro R21 2026 inc NX 7 Binding Package");
    expect(integratedBinding("ARCADE 82 XPRESS11", "2027")?.title).toBe("Arcade 82 2027 inc Xpress 11 Binding Package");
    expect(integratedBinding("HERO GS R22 SPX 12", "2026")?.binding).toBe("SPX 12");
  });

  it("leaves a ski that is not named with one, and one already called a package, alone", () => {
    expect(integratedBinding("M7 MANTRA", "2027")).toBeNull();
    expect(integratedBinding("Arcade 82 2027 inc Xpress 11 Binding Package", "2027")).toBeNull();
    expect(integratedBinding("EXPERIENCE 88 TI", "2026")).toBeNull();
  });

  it("is built as one package product, not a flat ski that then gets a Griffon", () => {
    const products = groupLineItems([
      line("HERO GS R22 SPX12", "170"), line("HERO GS R22 SPX12", "175"), line("HERO GS R22 SPX12", "182"),
      line("HERO GS PRO R21 NX7", "126"), line("HERO GS PRO R21 NX7", "134"),
    ], DEFAULT_CATEGORY_RULES);
    expect(products.map((p) => p.title)).toEqual(["Hero GS R22 2026 inc SPX 12 Binding Package", "Hero GS Pro R21 2026 inc NX 7 Binding Package"]);
    expect(products.map((p) => p.handle)).toEqual(["hero-gs-r22-2026-inc-spx-12-binding-package", "hero-gs-pro-r21-2026-inc-nx-7-binding-package"]);
    expect(products.every((p) => p.productType === "Skis" && p.tags.includes("ski packages"))).toBe(true);
    expect(products[0].variants.map((v) => v.item.length)).toEqual(["170", "175", "182"]);
    // Already a package: the shop's Griffon package is not made on top of it.
    const priceList = [{ title: "GRIFFON 13 MN", colour: "BLACK", rrp: 459, costPrice: 260 }];
    expect(packageProducts(products, priceList).packages).toHaveLength(0);
  });
});
