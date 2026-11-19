import { describe, expect, it } from "vitest";
import { Change, describeChange } from "./teach-chat";

describe("a change said as a sentence", () => {
  it("covers every shape", () => {
    expect(describeChange({ kind: "tag-rule", matchField: "brand", pattern: "Osprey", addTags: "Packs", setProductType: "" })).toBe('A product whose brand includes "Osprey" is tagged Packs.');
    expect(describeChange({ kind: "pricing", scope: "BRAND", matchValue: "Trek", mode: "MARGIN", percent: 40, roundTo: "0.99" })).toBe("Trek: 40% margin, prices ending 0.99.");
    expect(describeChange({ kind: "voice", avoid: ["premium"], spellings: [{ from: "color", to: "colour", brand: "" }] })).toBe('never says premium; writes "colour" not "color".');
    expect(describeChange({ kind: "section", heading: "Our warranty", text: "Two years.", types: [], brands: ["Osprey"] })).toBe('"Our warranty" is added after the copy on Osprey: Two years.');
    expect(describeChange({ kind: "brand-note", brand: "Arc'teryx", fit: "Runs small.", care: "", origin: "" })).toBe("Arc'teryx: fit, Runs small..");
  });
  it("refuses a change in no known shape", () => {
    expect(Change.safeParse({ kind: "delete-everything" }).success).toBe(false);
    expect(Change.safeParse({ kind: "setting", key: "apiKey", value: "x" }).success).toBe(false);
  });
});
