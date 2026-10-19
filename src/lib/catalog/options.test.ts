import { describe, expect, it } from "vitest";
import {
  BINDING_FITTING,
  BINDING_FITTING_VALUES,
  NO_VARIANT_OPTION,
  SYSTEM_FITTING_VALUES,
  bindingFittingValues,
  normaliseOptionName,
  normaliseOptionValue,
  writeOutSize,
  optionNamesFor,
  optionPlanFor,
} from "./options";
import { defaultGrams, mountingFee, packageCost, packagePrice } from "./variant-rules";

describe("what a product is sold by", () => {
  it("sells a ski by length, and a ski package by what is on it and who mounts it", () => {
    expect(optionPlanFor("Skis")).toEqual(["Length"]);
    expect(optionPlanFor("Skis", { offerFitting: true })).toEqual(["Length", BINDING_FITTING]);
    expect(optionPlanFor("Skis", { withBindings: true })).toEqual(["Length", "Binding Option", BINDING_FITTING]);
  });

  /**
   * A board binding screws onto inserts that are already there, so nobody is asked whether to mount
   * it: not one of the fourteen board products in the catalogue carries the fitting question.
   */
  it("asks nobody to mount a snowboard binding", () => {
    expect(optionPlanFor("Snowboards", { withBindings: true })).toEqual(["Length", "Binding Option", "Binding Size"]);
    expect(optionPlanFor("Snowboards", { withBindings: true })).not.toContain(BINDING_FITTING);
  });

  it("sells a sleeping bag by size, loft and which side the zip is on", () => {
    expect(optionPlanFor("Sleeping Bags")).toEqual(["Size", "Loft", "Zip Side"]);
  });

  it("sells everything else by colour then size", () => {
    for (const type of ["Snow Clothing", "Footwear", "Snowboard Boots", "Snowboard Bindings", "Packs and Bags"]) {
      expect(optionPlanFor(type), type).toEqual(["Colour", "Size"]);
    }
  });

  it("offers a tent its footprint", () => {
    expect(optionPlanFor("Tents")).toEqual(["Add Footprint (recommended)"]);
  });
});

describe("the mounting question", () => {
  it("offers the two answers the shop offers", () => {
    expect(BINDING_FITTING_VALUES).toEqual(["Do Not Mount My Bindings", "Please Mount My Bindings"]);
    expect(bindingFittingValues()).toEqual(BINDING_FITTING_VALUES);
  });

  /** Bindings on a rail are not drilled, so the mount is the system one and replaces the other. */
  it("asks the system question where the bindings sit on a rail", () => {
    expect(bindingFittingValues(true)).toEqual(SYSTEM_FITTING_VALUES);
    expect(bindingFittingValues(true)).toContain("Please Mount My System Bindings");
    expect(bindingFittingValues(true)).not.toContain("Please Mount My Bindings");
  });
});

describe("only what actually varies becomes an option", () => {
  it("falls back to Shopify's single-variant spelling", () => {
    expect(optionNamesFor("Outdoor Accessories", [])).toEqual([NO_VARIANT_OPTION.name]);
    expect(NO_VARIANT_OPTION).toEqual({ name: "Title", value: "Default Title" });
  });

  it("orders what varies the way the shop reads it", () => {
    expect(optionNamesFor("Footwear", ["Size", "Colour"])).toEqual(["Colour", "Size"]);
    expect(optionNamesFor("Skis", ["Binding Fitting", "Length"], { offerFitting: true })).toEqual(["Length", BINDING_FITTING]);
    expect(optionNamesFor("Sleeping Bags", ["Zip Side", "Size", "Loft"])).toEqual(["Size", "Loft", "Zip Side"]);
  });

  it("carries an attribute the convention has no opinion about rather than dropping it", () => {
    expect(optionNamesFor("Climbing and Abseiling", ["Locking System"])).toEqual(["Locking System"]);
    expect(optionNamesFor("Snow Clothing", ["Colour", "Size", "Inseam"])).toEqual(["Colour", "Size", "Inseam"]);
  });

  it("keeps to the three Shopify allows", () => {
    expect(optionNamesFor("Sleeping Bags", ["Size", "Loft", "Zip Side", "Temperature"])).toHaveLength(3);
  });

  it("does not count the same option twice", () => {
    expect(optionNamesFor("Footwear", ["Colour", "Color", "Size"])).toEqual(["Colour", "Size"]);
  });
});

describe("spelling", () => {
  /** The shop is Australian; eight rows in the exports say Color. */
  it("writes Colour", () => {
    expect(normaliseOptionName("Color")).toBe("Colour");
    expect(normaliseOptionName("Colour")).toBe("Colour");
  });

  /** Seven sleeping bags ask for "Zip Size" with Left and Right underneath it. */
  it("asks for the zip side however the invoice spelled it", () => {
    expect(normaliseOptionName("Zip Size")).toBe("Zip Side");
  });

  it("fixes the one mistyped value in the catalogue", () => {
    expect(normaliseOptionValue("Do Not Mouny My Bindings")).toBe("Do Not Mount My Bindings");
    expect(normaliseOptionValue("Please Mount My Bindings")).toBe("Please Mount My Bindings");
  });

  it("writes a letter size out as the shop does, and leaves everything else alone", () => {
    expect(writeOutSize("S")).toBe("Small");
    expect(writeOutSize("m")).toBe("Medium");
    expect(writeOutSize("L")).toBe("Large");
    expect(writeOutSize("XL")).toBe("Extra Large");
    expect(writeOutSize("XS")).toBe("Extra Small");
    expect(writeOutSize("2XL")).toBe("2X Large");
    expect(writeOutSize("XXL")).toBe("2X Large");
    expect(writeOutSize("Medium")).toBe("Medium");
    expect(writeOutSize("S/M")).toBe("S/M");
    expect(writeOutSize("SM")).toBe("SM");
    expect(writeOutSize("10.5")).toBe("10.5");
    expect(writeOutSize("156W")).toBe("156W");
  });

  it("leaves everything else alone", () => {
    expect(normaliseOptionName("Loft")).toBe("Loft");
    expect(normaliseOptionValue("800+")).toBe("800+");
  });
});

describe("the variant columns the shop fixes", () => {
  it("weighs a ski at 2 kg and a board at 1 kg, whatever they really weigh", () => {
    expect(defaultGrams("Skis")).toBe(2000);
    expect(defaultGrams("Snowboards")).toBe(1000);
  });

  it("gives a bag a weight only once it has wheels", () => {
    expect(defaultGrams("Ski Accessories", "Double + Wheelie Ski Bag 185cm")).toBe(1000);
    expect(defaultGrams("Snowboard Accessories", "Wheelie Gig Snowboard Bag")).toBe(1000);
    expect(defaultGrams("Ski Accessories", "Ski & Boot Bag")).toBe(0);
  });

  it("leaves everything else at nothing", () => {
    for (const type of ["Snow Clothing", "Sleeping Bags", "Footwear", "Packs and Bags"]) {
      expect(defaultGrams(type, "Something"), type).toBe(0);
    }
  });
});

describe("what a ski sold with bindings costs and sells for", () => {
  it("adds the two recommended retails, and does not discount the pair", () => {
    expect(packagePrice({ rrp: 999, bindingRrp: 449 })).toBe(1448);
    expect(packagePrice({ rrp: 999 })).toBe(999);
  });

  /** A flat ski is mounted with bindings from elsewhere, which is the full job; a package is $39. */
  it("charges $55 to mount a flat ski and $39 to mount a package", () => {
    expect(mountingFee()).toBe(59);
    expect(mountingFee({ withBindings: true })).toBe(59);
    expect(mountingFee({ withBindings: true, system: true })).toBe(49);
    expect(packagePrice({ rrp: 999 }, { mounted: true })).toBe(999 + 59);
    expect(packagePrice({ rrp: 999, bindingRrp: 449 }, { mounted: true })).toBe(1448 + 59);
  });

  it("costs what the invoice says, plus the binding when one is on it", () => {
    expect(packageCost(450)).toBe(450);
    expect(packageCost(450, 210)).toBe(660);
  });
});
