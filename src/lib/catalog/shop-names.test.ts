import { describe, expect, it } from "vitest";
import { fitPhraseOf, nameLikeSibling } from "./shop-names";

const shop = [
  { title: "M4 Goggles (Toric) + Bonus Lens + MFI® Face Mask 2026", vendor: "Anon" },
  { title: "M4 Low Bridge Fit Goggles (Cylindrical) + Bonus Lens + MFI® Face Mask 2026", vendor: "Anon" },
  { title: "M4 Goggles (Cylindrical) + Bonus Lens + MFI® Face Mask 2026", vendor: "Anon" },
  { title: "Sync Low Bridge Fit Goggles + Bonus Lens 2026", vendor: "Anon" },
  { title: "M5S Goggles + Bonus Lens + MFI® Face Mask 2025", vendor: "Anon" },
  { title: "Men's Photon BOA® Snowboard Boots 2026", vendor: "Burton" },
];

describe("a new product named like the shop's listing of the same model", () => {
  it("takes the sibling's name and swaps the fit and the year", () => {
    expect(nameLikeSibling("M4 Toric Low Bridge", "2027", shop, "Anon")).toBe("M4 Low Bridge Fit Goggles (Toric) + Bonus Lens + MFI® Face Mask 2027");
    expect(nameLikeSibling("Sync", "2027", shop, "Anon")).toBe("Sync Goggles + Bonus Lens 2027");
    expect(nameLikeSibling("M5S Low Bridge", "2027", shop, "Anon")).toBe("M5S Low Bridge Fit Goggles + Bonus Lens + MFI® Face Mask 2027");
    expect(nameLikeSibling("M5S", "2027", shop, "Anon")).toBe("M5S Goggles + Bonus Lens + MFI® Face Mask 2027");
    expect(nameLikeSibling("Photon BOA Wide", "2027", shop, "Burton")).toBe("Men's Photon BOA® Wide Snowboard Boots 2027");
    // A shape the shop has not listed, in the brackets where the shop puts the shape.
    expect(nameLikeSibling("M4S Toric Low Bridge", "2027", [{ title: "M4S Low Bridge Fit Goggles (Cylindrical) + Bonus Lens + MFI® Face Mask 2026", vendor: "Anon" }], "Anon")).toBe("M4S Low Bridge Fit Goggles (Toric) + Bonus Lens + MFI® Face Mask 2027");
  });
  it("names nothing it cannot place on one sibling", () => {
    expect(nameLikeSibling("M6 Low Bridge", "2027", shop, "Anon")).toBeNull();
    expect(nameLikeSibling("M4 Low Bridge", "2027", shop, "Anon")).toBeNull();
  });
  it("reads the fit a name carries", () => {
    expect(fitPhraseOf("M4 Low Bridge Fit Goggles")).toBe("Low Bridge Fit");
    expect(fitPhraseOf("Photon BOA Wide")).toBe("Wide");
    expect(fitPhraseOf("M4 Goggles")).toBe("");
  });
});
