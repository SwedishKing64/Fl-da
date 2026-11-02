import { describe, expect, it } from "vitest";
import { describeOptionTags, isOptionTag, learnOptionTags, optionTagsFor, renderOptionTag } from "./option-tags";

const listing = (tags: string[], options: Array<{ name: string; values: string[] }>) => ({ tags, options });

describe("tags that mirror a product's variants", () => {
  it("learns the shape most products use for each option, prefix and all", () => {
    const listings = Array.from({ length: 8 }, (_, i) => listing(["bikes", "road bikes", `Size_${52 + i}`, `Size_${54 + i}`, "Colour_Pearl White", i % 2 ? "Colour_Deep Red" : "mens"], [{ name: "Size", values: [String(52 + i), String(54 + i)] }, { name: "Colour", values: ["Pearl White", ...(i % 2 ? ["Deep Red"] : [])] }]));
    const learned = learnOptionTags(listings);
    expect(learned).toEqual([
      { option: "Colour", template: "Colour_{value}", form: "as-is", example: "Colour_Pearl White" },
      { option: "Size", template: "Size_{value}", form: "as-is", example: "Size_52" },
    ]);
  });

  it("learns a bare value, a lower-cased value and a slug, each as the plainest shape that fits", () => {
    const bare = Array.from({ length: 6 }, () => listing(["Black", "jackets"], [{ name: "Colour", values: ["Black"] }]));
    expect(learnOptionTags(bare)[0]).toMatchObject({ template: "{value}", form: "as-is" });
    const lower = Array.from({ length: 6 }, () => listing(["size:xl", "jackets"], [{ name: "Size", values: ["XL"] }]));
    expect(learnOptionTags(lower)[0]).toMatchObject({ template: "size:{value}", form: "lower" });
    const slugged = Array.from({ length: 6 }, () => listing(["colour-gloss-black", "bikes"], [{ name: "Colour", values: ["Gloss Black"] }]));
    expect(learnOptionTags(slugged)[0]).toMatchObject({ template: "colour-{value}", form: "slug", example: "colour-gloss-black" });
  });

  it("learns nothing from a few products, from a shop that tags no values, or from Default Title", () => {
    expect(learnOptionTags(Array.from({ length: 3 }, () => listing(["Size_M"], [{ name: "Size", values: ["M"] }])))).toEqual([]);
    expect(learnOptionTags(Array.from({ length: 10 }, () => listing(["jackets", "mens"], [{ name: "Size", values: ["M", "L"] }])))).toEqual([]);
    expect(learnOptionTags(Array.from({ length: 10 }, () => listing(["Default Title"], [{ name: "Title", values: ["Default Title"] }])))).toEqual([]);
  });

  it("writes the tags a new product's variants call for, in the shape learned", () => {
    const patterns = [
      { option: "Size", template: "Size_{value}", form: "as-is" as const, example: "Size_52" },
      { option: "Colour", template: "colour-{value}", form: "slug" as const, example: "colour-black" },
    ];
    expect(optionTagsFor([{ name: "Colour", values: ["Gloss Black", "Satin Sage"] }, { name: "Size", values: ["S", "M"] }, { name: "Material", values: ["Alloy"] }], patterns))
      .toEqual(["colour-gloss-black", "colour-satin-sage", "Size_S", "Size_M"]);
    expect(renderOptionTag({ template: "{value}", form: "lower" }, "Deep Red")).toBe("deep red");
  });

  it("tells a mirrored tag from a shelf tag, exactly with the options to hand and by shape without", () => {
    const patterns = [{ option: "Size", template: "Size_{value}", form: "as-is" as const, example: "Size_52" }, { option: "Colour", template: "{value}", form: "as-is" as const, example: "Black" }];
    expect(isOptionTag("Size_54", patterns)).toBe(true);
    expect(isOptionTag("Size_54", patterns, [{ name: "Size", values: ["52"] }])).toBe(false);
    expect(isOptionTag("Black", patterns, [{ name: "Colour", values: ["Black"] }])).toBe(true);
    // A bare value cannot be told by shape alone, so it is a shelf tag until the options say otherwise.
    expect(isOptionTag("Black", patterns)).toBe(false);
    expect(isOptionTag("road bikes", patterns)).toBe(false);
    expect(isOptionTag("Size_54", [])).toBe(false);
  });

  it("says the patterns in a line", () => {
    expect(describeOptionTags([{ option: "Size", template: "Size_{value}", form: "as-is", example: "Size_52" }, { option: "Colour", template: "{value}", form: "as-is", example: "Black" }])).toBe('each Size as "Size_52" and each Colour as "Black"');
  });
});
