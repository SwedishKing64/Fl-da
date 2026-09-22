/**
 * Building a package, checked against the packages this shop already has.
 *
 * The numbers below are the Blaze 94's real ones, read out of their ski export: flat 2027 at
 * 1449.99, the package at 1908.99 not-mounted and 1963.99 mounted. Every shape and spelling here
 * was counted from the same file rather than chosen.
 */

import { describe, expect, it } from "vitest";
import { FITTING_MOUNT, FITTING_NO_MOUNT, MOUNT_FEE, buildPackage, packageTitle, type BindingChoice } from "./packages";

const GRIFFON: BindingChoice = { label: "Marker Griffon - Black", rrp: 459, shortName: "Marker Griffon" };

const BLAZE = {
  title: "Blaze 94",
  brand: "Volkl",
  season: "2027",
  tags: ["volkl", "skis", "freeride and powder skis", "mens", "2027"],
  lengths: [{ length: "172", rrp: 1449.99 }, { length: "179", rrp: 1449.99 }],
};

describe("what a package is called", () => {
  it("names the binding, which is the newer of the two forms in the catalogue", () => {
    expect(packageTitle("Blaze 94", "2027", GRIFFON)).toBe("Blaze 94 2027 inc Marker Griffon Binding Package");
  });

  it("does not repeat a year the name already carries", () => {
    expect(packageTitle("Blaze 94 2027", "2027", GRIFFON)).toBe("Blaze 94 2027 inc Marker Griffon Binding Package");
  });

  it("drops a colour suffix but keeps the model number, as the catalogue does", () => {
    // Their real titles read "inc Look Pivot 12", "inc Tyrolia Attack 11", "inc Marker M7.0" —
    // the number is part of the binding's name. What gets dropped is the colour: "Marker Griffon
    // - Black" is written "inc Marker Griffon".
    expect(packageTitle("Mantra M7", "2027", { label: "Fritschi Tecton 13", rrp: 700 }))
      .toBe("Mantra M7 2027 inc Fritschi Tecton 13 Binding Package");
    expect(packageTitle("Mindbender 85", "2025", { label: "Marker Squire - White", rrp: 300 }))
      .toBe("Mindbender 85 2025 inc Marker Squire Binding Package");
  });
});

describe("building one", () => {
  const pack = buildPackage(BLAZE, [GRIFFON]);

  it("has the three options the catalogue uses, in that order", () => {
    expect(pack.optionNames).toEqual(["Length", "Binding Option", "Binding Fitting"]);
  });

  it("crosses every length with every binding and both fittings, with no gaps", () => {
    expect(pack.variants).toHaveLength(2 * 1 * 2);
    expect(new Set(pack.variants.map((v) => v.bindingFitting))).toEqual(new Set([FITTING_NO_MOUNT, FITTING_MOUNT]));
  });

  it("prices the package as the ski plus the binding — the real Blaze 94 numbers", () => {
    const v = pack.variants.find((x) => x.length === "172" && x.bindingFitting === FITTING_NO_MOUNT);
    expect(v?.rrp).toBe(1908.99);   // 1449.99 ski + 459.00 Griffon, as the catalogue has it
  });

  it("adds the mount fee to the recommended retail, not to the sell price", () => {
    const v = pack.variants.find((x) => x.length === "172" && x.bindingFitting === FITTING_MOUNT);
    expect(v?.rrp).toBe(1963.99);   // 1908.99 + 55, again the catalogue's own figure
    expect(MOUNT_FEE).toBe(55);
  });

  it("carries the ski's tags and adds the one that marks a package", () => {
    expect(pack.tags).toContain("ski packages");
    expect(pack.tags).toContain("freeride and powder skis");
    expect(pack.tags).toContain("volkl");
  });

  it("gets a handle built from the brand and the package name", () => {
    expect(pack.handle).toBe("volkl-blaze-94-2027-inc-marker-griffon-binding-package");
  });

  it("offers every binding on every length when there is more than one", () => {
    const two = buildPackage(BLAZE, [GRIFFON, { label: "Fritschi Tecton 13", rrp: 700 }]);
    expect(two.variants).toHaveLength(2 * 2 * 2);
    const tecton = two.variants.find((v) => v.length === "179" && v.bindingOption === "Fritschi Tecton 13" && v.bindingFitting === FITTING_NO_MOUNT);
    expect(tecton?.rrp).toBe(2149.99);   // 1449.99 + 700
  });

  it("leaves a length with no price unpriced rather than borrowing another length's", () => {
    // Lengths are not priced alike — the Blaze 94 2025 is 1724.99 at 172 and 2469.99 at 179 — so
    // carrying one across would be a wrong price, not a missing one.
    const odd = buildPackage({ ...BLAZE, lengths: [{ length: "172", rrp: 1449.99 }, { length: "186", rrp: null }] }, [GRIFFON]);
    expect(odd.variants.filter((v) => v.length === "186").every((v) => v.rrp === null)).toBe(true);
    expect(odd.variants.find((v) => v.length === "172" && v.bindingFitting === FITTING_MOUNT)?.rrp).toBe(1963.99);
  });

  it("refuses to build a package with no binding at all", () => {
    expect(() => buildPackage(BLAZE, [])).toThrow(/at least one binding/i);
  });
});
