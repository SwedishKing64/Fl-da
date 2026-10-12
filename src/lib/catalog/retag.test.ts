import { describe, expect, it } from "vitest";
import { retagForType, shelfTags } from "./product-tags";
import { spellType } from "./pipeline-pure";
import { generateCsv } from "./csv";
import { parseCsv } from "./csv";

describe("a product whose Type was changed after it was tagged", () => {
  it("swaps the old Type's shelf tags for the new one's and keeps the rest", () => {
    const tags = ["ski-accessories", "ski", "2026", "123abc-js", "osprey", "mens", "accessories"];
    expect(retagForType(tags, "Ski Accessories", "Packs and Bags")).toEqual(["packs-and-bags", "outdoor", "2026", "123abc-js", "osprey", "mens"]);
  });

  it("changes nothing for a move from a shelf to its own heading, or to the same Type", () => {
    const tags = ["hiking packs", "packs-and-bags", "outdoor", "osprey"];
    expect(retagForType(tags, "Hiking Packs", "Packs and Bags")).toBe(tags);
    expect(retagForType(tags, "Packs & Bags", "Packs and Bags")).toBe(tags);
  });

  it("knows a Type's shelf, heading and menu tags", () => {
    expect(shelfTags("Hiking Packs")).toEqual(["hiking packs", "packs-and-bags", "outdoor"]);
    expect(shelfTags("Nonsense")).toEqual([]);
  });
});

describe("the Type column", () => {
  it("is spelled the way the shop's own exports spell it", () => {
    expect(spellType("Packs & Bags")).toBe("Packs and Bags");
    expect(spellType("Climbing & Abseiling")).toBe("Climbing and Abseiling");
    expect(spellType("Snow Clothing")).toBe("Snow Clothing");
    const csv = generateCsv([{ handle: "exos-pro-55-2026", title: "Men's Exos Pro 55 2026", vendor: "Osprey", productType: "Packs & Bags", tags: ["outdoor"], images: [], variants: [{ sku: "", price: "499.00", option1Value: "Dale Grey", option2Value: null, option3Value: null, images: [] }] } as never]);
    const grid = parseCsv(csv);
    expect(grid[1][grid[0].indexOf("Type")]).toBe("Packs and Bags");
  });
});
