import { describe, expect, it } from "vitest";
import { leadsWithVendor, productTitle, seoTitle, withoutVendor } from "./titles";
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
