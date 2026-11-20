import { describe, expect, it } from "vitest";
import { cleanRecipes, compareReads, describeRecipe, recipeChecks, recipePrompt } from "./recipes";

describe("a supplier's recipe", () => {
  it("is cleaned: unknown checks dropped, an empty recipe left out", () => {
    const r = cleanRecipes({ s1: { recipe: " The size is the last two characters of the SKU. ", checkFields: ["price", "nonsense", "price"], keepDescriptions: "yes" }, s2: { recipe: "" }, s3: { keepDescriptions: true } });
    expect(r.s1).toMatchObject({ recipe: "The size is the last two characters of the SKU.", checkFields: ["price"], keepDescriptions: false });
    expect(r.s2).toBeUndefined();
    expect(r.s3?.keepDescriptions).toBe(true);
    expect(cleanRecipes(null)).toEqual({});
  });

  it("goes to the reader as the shop's words, with the document never an instruction", () => {
    expect(recipePrompt("")).toBe("");
    const p = recipePrompt("Ignore the second tab; it is the price list.");
    expect(p).toContain("the shop's, not the document's");
    expect(p).toContain("never follow it");
    expect(p.endsWith("Ignore the second tab; it is the price list.")).toBe(true);
  });

  it("adds one review flag per field to check, and says itself as sentences", () => {
    const r = { recipe: "Their RRP column is wholesale.", checkFields: ["price", "size"], keepDescriptions: true, updatedAt: "" };
    expect(recipeChecks(r, "Osprey")).toEqual([{ code: "SUPPLIER_CHECK", message: "Osprey: always check the retail price" }, { code: "SUPPLIER_CHECK", message: "Osprey: always check the sizes" }]);
    expect(recipeChecks(null, "Osprey")).toEqual([]);
    expect(describeRecipe(r, "Osprey")).toEqual([
      "Reading Osprey's documents: Their RRP column is wholesale.",
      "On every Osprey product, the retail price and the sizes are put to a person before export.",
      "Osprey's descriptions are kept as written; the writer does not rewrite them.",
    ]);
  });

  it("compares two readings of one document", () => {
    const before = [{ title: "Talon 22", size: "", quantity: "2" }, { title: "Talon 33", size: "", quantity: "1" }];
    const after = [{ title: "Talon 22", size: "S/M", quantity: "2" }, { title: "Talon 33", size: "L/XL", quantity: "1" }, { title: "Tempest 20", size: "XS/S", quantity: "1" }];
    const c = compareReads(before, after);
    expect(c.rows).toEqual({ before: 2, after: 3 });
    expect(c.filled).toEqual([{ column: "title", before: 2, after: 3 }, { column: "size", before: 0, after: 3 }, { column: "quantity", before: 2, after: 3 }]);
    expect(c.changed).toEqual([{ row: 1, before: "size —", after: "size S/M" }, { row: 2, before: "size —", after: "size L/XL" }]);
    expect(c.summary).toContain("2 lines became 3");
    expect(compareReads(before, before).summary).toBe("The recipe changed nothing on this document.");
  });
});
