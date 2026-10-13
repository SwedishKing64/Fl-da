import { describe, expect, it } from "vitest";
import { leadsWithVendor, productTitle, seasonTagFrom, seoTitle, withoutVendor } from "./titles";
import { buildHandle } from "./handle";
import { EVERGREEN_SEASON, MANUAL_SEASON } from "./tagging";

describe("the Title column", () => {
  /** Every snowboard in the shop's catalogue carries its year, and 96% of skis. */
  it("puts the season after the name", () => {
    expect(productTitle("Mantra 88", 2026)).toBe("Mantra 88 2026");
    expect(productTitle("Process", "2027")).toBe("Process 2027");
  });

  it("does not give a product its year twice", () => {
    expect(productTitle("Mantra Junior 2025", 2026)).toBe("Mantra Junior 2025");
  });

  /** Outdoor kit is evergreen, and a tent is a tent whatever year it is. */
  it("leaves an unseasonal product alone", () => {
    expect(productTitle("Hornet 1P", EVERGREEN_SEASON)).toBe("Hornet 1P");
    expect(productTitle("Hornet 1P", MANUAL_SEASON)).toBe("Hornet 1P");
    expect(productTitle("Hornet 1P", null)).toBe("Hornet 1P");
    expect(productTitle("Hornet 1P")).toBe("Hornet 1P");
  });
});

describe("the SEO Title column", () => {
  /** 752 of the 797 products with one are exactly the vendor and then the title; none is the title alone. */
  it("puts the vendor in front of the title", () => {
    expect(seoTitle("Volkl", "Mantra 88 2026")).toBe("Volkl Mantra 88 2026");
    expect(seoTitle("Giro", "Ledge MIPS Helmet")).toBe("Giro Ledge MIPS Helmet");
  });

  it("does not name the brand twice", () => {
    expect(seoTitle("Burton", "Burton Custom 2027")).toBe("Burton Custom 2027");
  });

  it("copes with one half missing", () => {
    expect(seoTitle("", "Mantra 88 2026")).toBe("Mantra 88 2026");
    expect(seoTitle("Volkl", "")).toBe("Volkl");
  });
});

describe("the brand belongs in the Vendor column", () => {
  /** Not one of the shop's 827 products has a Title beginning with its own vendor. */
  it("takes the brand back off a title that arrived with it", () => {
    expect(withoutVendor("Atomic", "Atomic Bent 90 Skis")).toBe("Bent 90 Skis");
    expect(withoutVendor("Volkl", "Volkl - Mantra 88")).toBe("Mantra 88");
    expect(leadsWithVendor("Atomic", "Atomic Bent 90")).toBe(true);
  });

  it("leaves a title that never had it", () => {
    expect(withoutVendor("Atomic", "Bent 90 Skis")).toBe("Bent 90 Skis");
    expect(withoutVendor("", "Bent 90 Skis")).toBe("Bent 90 Skis");
    expect(leadsWithVendor("Atomic", "Bent 90")).toBe(false);
  });

  /** "Atomica" is not "Atomic" with a suffix. */
  it("does not mistake a longer word for the brand", () => {
    expect(withoutVendor("Atomic", "Atomica Skis")).toBe("Atomica Skis");
  });
});

/**
 * The URL handle carries the season too.
 *
 * Shopify derives a handle from the title once, when the product is created, and never again. A
 * year appended to the name afterwards leaves the URL a season behind for good — and it cannot be
 * put right by re-importing, because the importer matches products ON the handle, so a changed one
 * makes a second product instead of renaming the first.
 *
 * The shop's own catalogue settles what it should be: of the 259 products whose name carries a
 * year, 242 carry it in the handle as well.
 */
describe("the season reaches the handle, not just the name", () => {
  it("reads the season off the year tag", () => {
    expect(seasonTagFrom(["snow clothing", "2026", "mens"])).toBe("2026");
    expect(seasonTagFrom(["snow clothing", "mens"])).toBeNull();
    expect(seasonTagFrom([])).toBeNull();
  });

  it("builds a handle from the name the product will really carry", () => {
    const season = seasonTagFrom(["2026", "snow clothing"]);
    expect(buildHandle({ brand: "Karbon", title: productTitle("Lithium Men's Insulated Jacket", season) }))
      .toBe("karbon-lithium-mens-insulated-jacket-2026");
  });

  it("does not put a year on something that has no season", () => {
    expect(buildHandle({ brand: "Sea to Summit", title: productTitle("Alto TR2 Tent", seasonTagFrom(["tents"])) }))
      .toBe("sea-to-summit-alto-tr2-tent");
  });

  it("does not double the year when the name already carries one", () => {
    expect(buildHandle({ brand: "Volkl", title: productTitle("M7 Mantra 2027", seasonTagFrom(["2027"])) }))
      .toBe("volkl-m7-mantra-2027");
  });

  it("leaves the sentinel years out of the handle, as they are not a season", () => {
    for (const sentinel of ["2999", "2998"]) {
      expect(buildHandle({ brand: "Oakley", title: productTitle("Target Line L Snow Goggles", sentinel) }))
        .toBe("oakley-target-line-l-snow-goggles");
    }
  });
});

describe("an apostrophe closes up in a handle", () => {
  it("writes mens, womens and kids the way the catalogue does", () => {
    expect(buildHandle({ brand: "Karbon", title: "Lithium Men's Insulated Jacket" })).toBe("karbon-lithium-mens-insulated-jacket");
    expect(buildHandle({ brand: "Burton", title: "Women's Reserve 2L Stretch Pants" })).toBe("burton-womens-reserve-2l-stretch-pants");
    expect(buildHandle({ brand: "Burton", title: "Kids' Smalls Re:Flex Snowboard Bindings" })).toBe("burton-kids-smalls-re-flex-snowboard-bindings");
  });

  it("closes up a curly apostrophe too, since that is what a supplier's sheet usually carries", () => {
    expect(buildHandle({ brand: "Burton", title: "Women’s Reserve 2L Stretch Pants" })).toBe("burton-womens-reserve-2l-stretch-pants");
  });
});
