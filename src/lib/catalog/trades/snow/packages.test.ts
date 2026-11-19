/**
 * Building a package, checked against a shop whose packages are priced ski plus binding, with a
 * $59 drill mount or a $49 system mount on the retail: the shape a ski shop's catalogue takes.
 */

import { describe, expect, it } from "vitest";
import { buildPackage, packageTitle, type BindingChoice } from "./packages";
import { setPackageTerms } from "./terms";

const FITTING_NO_MOUNT = "Do Not Mount My Bindings";
const FITTING_MOUNT = "Please Mount My Bindings";
const MOUNT_FEE = 59;
setPackageTerms({ drillMountFee: 59, systemMountFee: 49, fittingMount: FITTING_MOUNT, fittingNoMount: FITTING_NO_MOUNT });

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
    expect(v?.rrp).toBe(1967.99);   // 1908.99 + 59, the drill-mount charge since 2026-10-20
    expect(MOUNT_FEE).toBe(59);
  });

  it("carries the ski's tags and adds the one that marks a package", () => {
    expect(pack.tags).toContain("ski packages");
    expect(pack.tags).toContain("freeride and powder skis");
    expect(pack.tags).toContain("volkl");
  });

  it("gets the flat ski's handle with the package on the end, as the shop addresses them", () => {
    expect(pack.handle).toBe("blaze-94-2027-inc-marker-griffon-binding-package");
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
    expect(odd.variants.find((v) => v.length === "172" && v.bindingFitting === FITTING_MOUNT)?.rrp).toBe(1967.99);
  });

  it("refuses to build a package with no binding at all", () => {
    expect(() => buildPackage(BLAZE, [])).toThrow(/at least one binding/i);
  });
});

/**
 * The barcode on a package is the ski's.
 *
 * Counted from their ski export: of the 302 (package, length) pairs carrying a barcode, every one
 * uses a single barcode across every binding option and every fitting — no exceptions — and 466 of
 * the 474 that can be matched back to the flat ski are that ski's own. The eight that are not are
 * two products with a leading zero on one of the two, which is drift in the data rather than a
 * different rule.
 */
describe("barcodes on a package", () => {
  const WITH_CODES = {
    ...BLAZE,
    lengths: [
      { length: "172", rrp: 1449.99, barcode: "821264800133" },
      { length: "179", rrp: 1449.99, barcode: "821264800140" },
    ],
  };

  it("puts the ski's barcode on every variant of that length", () => {
    const pack = buildPackage(WITH_CODES, [GRIFFON, { label: "Fritschi Tecton 13", rrp: 700 }]);
    const at172 = pack.variants.filter((v) => v.length === "172");
    expect(at172).toHaveLength(4);                                    // 2 bindings × 2 fittings
    expect(new Set(at172.map((v) => v.barcode))).toEqual(new Set(["821264800133"]));
  });

  it("keeps each length on its own barcode", () => {
    const pack = buildPackage(WITH_CODES, [GRIFFON]);
    expect(pack.variants.find((v) => v.length === "179")?.barcode).toBe("821264800140");
  });

  it("never carries a binding's barcode, whatever the binding brings", () => {
    // The Marker barcode list is a separate file; nothing from it belongs on a ski package.
    const pack = buildPackage(WITH_CODES, [{ label: "Marker Griffon - Black", rrp: 459, shortName: "Marker Griffon" }]);
    expect(pack.variants.every((v) => v.barcode === "821264800133" || v.barcode === "821264800140")).toBe(true);
    expect(pack.variants.some((v) => v.barcode === "883295505555")).toBe(false);
  });

  it("leaves the barcode empty when the ski has none, rather than borrowing one", () => {
    const pack = buildPackage({ ...WITH_CODES, lengths: [{ length: "186", rrp: 1449.99 }] }, [GRIFFON]);
    expect(pack.variants.every((v) => v.barcode === "")).toBe(true);
  });
});

describe("the binding's price off a supplier's price list", () => {
  it("takes one cost however many decimals it is written to", async () => {
    const { bindingFrom, specFromName } = await import("./packages");
    // The order form's INDENT is 158.6363…; the same binding, read off the order's own line, 158.64.
    const found = bindingFrom(specFromName("Squire 11 white")!, [
      { title: "SQUIRE 11; 90MM", colour: "WHITE", rrp: 349, costPrice: 158.63636363636363 },
      { title: "SQUIRE 11 100MM WHITE", colour: "WHITE", rrp: 349, costPrice: 158.64 },
    ]);
    expect(found).toMatchObject({ label: "Squire 11 - White", rrp: 349, cost: 158.64 });
  });

  it("refuses a binding priced two different ways", async () => {
    const { bindingFrom, specFromName } = await import("./packages");
    expect(bindingFrom(specFromName("Squire 11 white")!, [
      { title: "SQUIRE 11; 90MM", colour: "WHITE", rrp: 349, costPrice: 158.64 },
      { title: "SQUIRE 11; 100MM", colour: "WHITE", rrp: 379, costPrice: 158.64 },
    ])).toBeNull();
  });

  it("adds the shop's drill mount to the retail of the mounted fitting, and not to the cost", async () => {
    const { buildPackage } = await import("./packages");
    const griffon: BindingChoice = { label: "Marker Griffon - Black", shortName: "Marker Griffon", rrp: 450, cost: 241 };
    const pack = buildPackage({ title: "QST 94", season: "2027", brand: "Salomon", tags: [], lengths: [{ length: "174", rrp: 949.99, cost: 500 }] } as never, [griffon]);
    const by = Object.fromEntries(pack.variants.map((v) => [v.bindingFitting, v]));
    expect(by[FITTING_NO_MOUNT]).toMatchObject({ rrp: 1399.99, cost: 741 });
    expect(by[FITTING_MOUNT]).toMatchObject({ rrp: 1458.99, cost: 741 });
  });

  it("charges nothing to mount, under plain fitting words, until the shop says otherwise", async () => {
    const { buildPackage } = await import("./packages");
    const { DEFAULT_PACKAGE_TERMS } = await import("../../types");
    setPackageTerms(null);
    try {
      const pack = buildPackage({ title: "QST 94", season: "2027", brand: "Salomon", tags: [], lengths: [{ length: "174", rrp: 949.99, cost: 500 }] } as never, [{ label: "Marker Griffon", rrp: 450, cost: 241 }]);
      expect(pack.variants.map((v) => [v.bindingFitting, v.rrp])).toEqual([[DEFAULT_PACKAGE_TERMS.fittingNoMount, 1399.99], [DEFAULT_PACKAGE_TERMS.fittingMount, 1399.99]]);
    } finally {
      setPackageTerms({ drillMountFee: 59, systemMountFee: 49, fittingMount: FITTING_MOUNT, fittingNoMount: FITTING_NO_MOUNT });
    }
  });
});

describe("a binding as somebody names it in the instruction chat", () => {
  it("is found on the price list by its model words, in the colour asked for", async () => {
    const { specFromName, bindingFrom } = await import("./packages");
    const list = [
      { title: "GRIFFON 13 MN; 90MM", colour: "BLACK", rrp: 459, costPrice: 208.64 },
      { title: "SQUIRE 11; 90MM", colour: "WHITE", rrp: 349, costPrice: 158.64 },
      { title: "SQUIRE 11; 90MM", colour: "BLACK", rrp: 349, costPrice: 158.64 },
    ];
    expect(bindingFrom(specFromName("the Griffon 13 MN")!, list)).toMatchObject({ label: "the Griffon 13 MN", rrp: 459, cost: 208.64 });
    // Two colours of the Squire 11 at one price: either row prices it.
    expect(bindingFrom(specFromName("Marker Squire 11")!, list)).toMatchObject({ rrp: 349 });
    expect(bindingFrom(specFromName("Squire 11 black")!, list)).toMatchObject({ label: "Squire 11 - Black", rrp: 349 });
    // No shop's own binding is anyone's default.
    expect(specFromName("")).toBeNull();
  });
});

describe("directives saved before packages could be asked for", () => {
  it("still read, with packages left as usual", async () => {
    const { parseDirectives } = await import("../../instructions");
    const d = parseDirectives(JSON.stringify({ addTags: ["2998"], discountPct: 30, vendor: "", productType: "", evergreen: false, notes: "" }));
    expect(d.addTags).toEqual(["2998"]);
    expect(d.discountPct).toBe(30);
    expect(d.packages).toBe("");
    expect(d.packageBindings).toEqual([]);
  });
});

describe("a year said in the instruction chat", () => {
  it("is read, described, and absent from directives saved before it existed", async () => {
    const { parseDirectives, describeDirectives } = await import("../../instructions");
    expect(describeDirectives(parseDirectives(JSON.stringify({ season: "2026" })))).toContain("Year tag 2026 on every product");
    expect(describeDirectives(parseDirectives(JSON.stringify({ addTags: ["2998"] })))).not.toContain("Year tag");
  });
});

describe("bindings picked from the shop's list", () => {
  it("offers each picked binding on one package, with the drill or system mount charge each takes", async () => {
    const { packageProducts } = await import("./packages");
    const { groupLineItems } = await import("../../grouping");
    const { DEFAULT_CATEGORY_RULES } = await import("../../categorize");
    const { pickerFor, parseBindingList } = await import("./binding-list");
    const ski = { ...(await import("../../types")).emptyLineItem(), title: "Test Ski", brand: "Volkl", length: "170", rrp: 1000, costPrice: 500, quantity: 1, category: "skis", season: "2027" };
    const grouped = groupLineItems([ski], DEFAULT_CATEGORY_RULES);
    // Made-up figures, in the shape of the shop's sheet.
    const list = parseBindingList([["Binding Name", "RRP", "Wholesale"], ["Marker Griffon", "400", "200"], ["Atomic M 10 GW", "300", "150"]]);
    const { packages } = packageProducts(grouped, [], [], {}, pickerFor(list, { "test ski": ["Marker Griffon", "Atomic M 10 GW"] }), list);
    expect(packages).toHaveLength(1);
    expect(packages[0].title).toBe("Test Ski 2027 inc Binding Package");
    expect(packages[0].variants.map((v) => [v.option2Value, v.option3Value, v.item.rrp, v.item.costPrice])).toEqual([
      ["Marker Griffon", "Do Not Mount My Bindings", 1400, 700],
      ["Marker Griffon", "Please Mount My Bindings", 1459, 700],
      ["Atomic M 10 GW", "Do Not Mount My Bindings", 1300, 650],
      ["Atomic M 10 GW", "Please Mount My Bindings", 1349, 650],
    ]);
    // Nothing ticked is no package.
    expect(packageProducts(grouped, [], [], {}, pickerFor(list, { "test ski": [] }), list).packages).toHaveLength(0);
  });
});

describe("the shop's binding list", () => {
  it("is empty until the shop makes one", async () => {
    const { parseBindingList } = await import("./binding-list");
    expect(parseBindingList([["Nothing", "here"]])).toEqual([]);
  });
});

describe("which products are flat skis, to be packaged", () => {
  it("takes any of the shop's ski Types, not cross-country", async () => {
    const { isFlatSki } = await import("./packages");
    const ski = (productType: string, title = "N Bent 100 2026") => isFlatSki({ productType, title, tags: [] });
    expect(ski("Skis")).toBe(true);
    expect(ski("Mens Skis")).toBe(true);
    expect(ski("Freeride & Powder Skis")).toBe(true);
    expect(ski("Cross-Country Skis")).toBe(false);
    expect(ski("Ski Packages")).toBe(false);
    expect(ski("Ski Boots")).toBe(false);
    expect(ski("Skis", "N Bent 100 2026 inc Marker Griffon Binding Package")).toBe(false);
  });
});
