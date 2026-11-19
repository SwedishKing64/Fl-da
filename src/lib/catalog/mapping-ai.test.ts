import { describe, expect, it } from "vitest";
import { fillMapping } from "./mapping-ai";
import type { Mapping } from "./mapping";

describe("the model's columns filling the heuristics' gaps", () => {
  it("keeps every column the headings placed, fills the empty ones, and never gives a field twice", () => {
    const fresh: Mapping = { "Art.": "sku", "Bezeichnung": "", "Menge": "quantity", "EK": "", "UVP": "" };
    const guessed: Mapping = { "Art.": "modelCode", "Bezeichnung": "title", "Menge": "quantity", "EK": "costPrice", "UVP": "rrp" };
    expect(fillMapping(fresh, guessed)).toEqual({ "Art.": "sku", "Bezeichnung": "title", "Menge": "quantity", "EK": "costPrice", "UVP": "rrp" });
    // A field the headings already placed is not given a second column.
    expect(fillMapping({ "Code": "sku", "Ref": "" }, { "Code": "sku", "Ref": "sku" })).toEqual({ "Code": "sku", "Ref": "" });
  });
  it("is the heuristics' own mapping when the model said nothing", () => {
    const fresh: Mapping = { "Item": "title" };
    expect(fillMapping(fresh, null)).toBe(fresh);
  });
});
