import { describe, expect, it } from "vitest";
import { groupLineItems } from "./grouping";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { emptyLineItem } from "./types";

describe("a board's sizes read into two different fields", () => {
  it("still gives every variant its size", () => {
    const line = (p: Partial<ReturnType<typeof emptyLineItem>>) => ({ ...emptyLineItem(), brand: "Burton", title: "FT Alekesam", productType: "Snowboards", category: "snowboards", season: "2026", quantity: 1, costPrice: 500, ...p });
    const [product] = groupLineItems([line({ length: "158" }), line({ size: "162W" }), line({ length: "166" })], DEFAULT_CATEGORY_RULES);
    expect(product.variants.map((v) => v.option1Value)).toEqual(["158", "162W", "166"]);
  });
});
