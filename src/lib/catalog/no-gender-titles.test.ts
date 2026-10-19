import { describe, expect, it } from "vitest";
import { applyMapping, withoutGender } from "./mapping";
import { groupLineItems } from "./grouping";
import { DEFAULT_CATEGORY_RULES } from "./categorize";

// A supplier's sheet as the mapping reads it: one gendered pack each way, and a jacket that
// carries its gender only in a column.
const MAPPING = { Name: "title" as const, Gender: "gender" as const, Size: "size" as const, Qty: "quantity" as const, Brand: "brand" as const, Code: "sku" as const };
const row = (Name: string, Gender: string, Size: string, Code: string, Brand = "Osprey") => applyMapping({ Name, Gender, Size, Qty: "1", Brand, Code }, MAPPING);

describe("no gender in any product's title but snow clothing's", () => {
  it("takes a gender off the front or the back of a name, and keeps what it said", () => {
    expect(withoutGender("Men's Exos 58")).toEqual({ title: "Exos 58", gender: "Mens" });
    expect(withoutGender("Eja Pro 55 - Women's")).toEqual({ title: "Eja Pro 55", gender: "Womens" });
    expect(withoutGender("Aether 65 (Men's)").title).toBe("Aether 65");
    expect(withoutGender("Unisex Daylite Plus").title).toBe("Daylite Plus");
    expect(withoutGender("Mentor Jacket").title).toBe("Mentor Jacket");
    expect(withoutGender("Kids' Daylite").title).toBe("Kids' Daylite");
  });

  it("builds men's and women's of one model as two products with the same plain name and their own handles", () => {
    const items = [
      row("Men's Talon 22", "", "S/M", "T22-M-SM"),
      row("Men's Talon 22", "", "L/XL", "T22-M-LX"),
      row("Women's Talon 22", "", "WXS/S", "T22-W-XS"),
      row("Cyclic GORE-TEX 2L Jacket", "MENS", "M", "100021-M", "Burton"),
    ];
    expect(items[0].gender).toBe("Mens");
    const products = groupLineItems(items, DEFAULT_CATEGORY_RULES);
    // Snow clothing alone says who it is for (asked 2026-10-19); the packs do not.
    for (const p of products.filter((x) => !/jacket/i.test(x.title))) expect(p.title).not.toMatch(/\b(men'?s|women'?s)\b/i);
    expect(products.find((p) => /jacket/i.test(p.title))?.title).toBe("Men's Cyclic GORE-TEX 2L Jacket");
    const talons = products.filter((p) => /talon 22/i.test(p.title));
    expect(talons).toHaveLength(2);
    expect(new Set(talons.map((p) => p.handle)).size).toBe(2);
    expect(talons.map((p) => p.handle).join(" ")).toMatch(/womens-/);
  });
});

describe("snow clothing, by gender", () => {
  it("makes the men's and women's of a jacket two products, each named for who it is for", () => {
    const items = [
      row("Cyclic GORE-TEX 2L Jacket", "MENS", "M", "100021-M", "Burton"),
      row("Cyclic GORE-TEX 2L Jacket", "MENS", "L", "100021-L", "Burton"),
      row("Women's Cyclic GORE-TEX 2L Jacket", "", "S", "100022-S", "Burton"),
      row("Kids' Cyclic Jacket", "Kids", "10", "100023-10", "Burton"),
    ];
    const titles = groupLineItems(items, DEFAULT_CATEGORY_RULES).map((p) => p.title).sort();
    expect(titles).toEqual(["Kids' Cyclic Jacket", "Men's Cyclic GORE-TEX 2L Jacket", "Women's Cyclic GORE-TEX 2L Jacket"]);
  });

  it("leaves anything else without a gender, and a snow garment for everyone without one", async () => {
    const { genderedTitle, genderOf } = await import("./gender-title");
    expect(genderedTitle("Cyclic Jacket", { productType: "Snow Jackets", gender: "womens" })).toBe("Women's Cyclic Jacket");
    expect(genderedTitle("Men's Cyclic Jacket", { productType: "Snow Jackets", gender: "mens" })).toBe("Men's Cyclic Jacket");
    expect(genderedTitle("Exos 58", { productType: "Hiking Packs", gender: "mens" })).toBe("Exos 58");
    expect(genderedTitle("Mantra 88", { productType: "Skis", gender: "mens" })).toBe("Mantra 88");
    expect(genderOf(["2027", "mens", "womens", "snow-clothing"])).toBe("");
    expect(genderOf(["2027", "womens", "snow-jackets"])).toBe("womens");
  });
});
