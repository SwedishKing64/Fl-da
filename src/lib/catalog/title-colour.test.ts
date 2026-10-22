import { describe, expect, it } from "vitest";
import { withoutColour } from "./title-colour";
import { pageProductTitle } from "./page-title";

describe("no colour in a title", () => {
  it("takes the product's own colour out, wherever it is", () => {
    expect(withoutColour("Heli Pro 20L Black", ["Black"])).toBe("Heli Pro 20L");
    expect(withoutColour("Boot Backpack 50L - Night Sky Oxford", ["Night Sky Oxford"])).toBe("Boot Backpack 50L");
    expect(withoutColour("Mission 25L Black/Grey Backpack", ["Black / Grey"])).toBe("Mission 25L Backpack");
  });

  it("takes a colour after a separator off the end, as a brand's page writes it", () => {
    expect(withoutColour("Boot Backpack 50L - Black")).toBe("Boot Backpack 50L");
    expect(withoutColour("Mission 25L (Heather Grey)")).toBe("Mission 25L");
    expect(withoutColour("Low Roller 40L | Dark Navy")).toBe("Low Roller 40L");
    expect(withoutColour("Team Heli Pro 20L, Black")).toBe("Team Heli Pro 20L");
  });

  it("leaves a model whose name has a colour word in it", () => {
    expect(withoutColour("Black Pearl 88")).toBe("Black Pearl 88");
    expect(withoutColour("Gray Wolf Jacket")).toBe("Gray Wolf Jacket");
    expect(withoutColour("Sender - Free 110")).toBe("Sender - Free 110");
    expect(withoutColour("Black", ["Black"])).toBe("Black");
  });

  it("titles a new product from its page without the colour the page put in", () => {
    expect(pageProductTitle("Boot Backpack 50L - Black | Dakine", "Dakine", "2026", ["Black"])).toBe("Boot Backpack 50L 2026");
    expect(pageProductTitle("Dakine Heli Pro 20L Backpack - Night Sky", "Dakine", null, [])).toBe("Heli Pro 20L Backpack");
  });
});

describe("no brand in a title taken from a page", () => {
  it("takes the brand off after a gender, with its ® and accents", async () => {
    const { withoutVendor } = await import("./titles");
    expect(withoutVendor("Burton", "Men's Burton Cartel X Re:Flex Snowboard Bindings")).toBe("Men's Cartel X Re:Flex Snowboard Bindings");
    expect(withoutVendor("Burton", "Burton® Step On Genesis")).toBe("Step On Genesis");
    expect(withoutVendor("Volkl", "Völkl Mantra 102")).toBe("Mantra 102");
    expect(withoutVendor("Black Crows", "Black Crows Camox")).toBe("Camox");
    expect(withoutVendor("Burton", "Custom Camber")).toBe("Custom Camber");
    expect(withoutVendor("Line", "Lineup Jacket")).toBe("Lineup Jacket");
    expect(pageProductTitle("Men's Burton Cartel X Re:Flex Snowboard Bindings | Burton.com", "Burton", "2027", ["White"])).toBe("Cartel X Re:Flex Snowboard Bindings 2027");
  });
});
