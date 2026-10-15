import { describe, expect, it } from "vitest";
import { applyMapping, withoutGender } from "./mapping";
import { groupLineItems } from "./grouping";
import { DEFAULT_CATEGORY_RULES } from "./categorize";

// A supplier's sheet as the mapping reads it: one gendered pack each way, and a jacket that
// carries its gender only in a column.
const MAPPING = { Name: "title" as const, Gender: "gender" as const, Size: "size" as const, Qty: "quantity" as const, Brand: "brand" as const, Code: "sku" as const };
const row = (Name: string, Gender: string, Size: string, Code: string, Brand = "Osprey") => applyMapping({ Name, Gender, Size, Qty: "1", Brand, Code }, MAPPING);

describe("no gender in any product's title", () => {
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
    for (const p of products) expect(p.title).not.toMatch(/\b(men'?s|women'?s)\b/i);
    const talons = products.filter((p) => /talon 22/i.test(p.title));
    expect(talons).toHaveLength(2);
    expect(new Set(talons.map((p) => p.handle)).size).toBe(2);
    expect(talons.map((p) => p.handle).join(" ")).toMatch(/womens-/);
  });
});
