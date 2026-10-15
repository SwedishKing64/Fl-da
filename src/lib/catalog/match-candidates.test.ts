import { describe, expect, it } from "vitest";
import { candidatesFor, describeCandidates } from "./match-candidates";

const rows = [
  { id: "gid://1", handle: "bent-90-2026", title: "Bent 90 2026", sku: "AA-166", barcode: "874452900016" },
  { id: "gid://1", handle: "bent-90-2026", title: "Bent 90 2026", sku: "AA-172", barcode: "874452900023" },
  { id: "gid://2", handle: "bent-90-2025", title: "Bent 90 2025", sku: "", barcode: "874452900016" },
  { id: "listing:beanie", handle: "beanie", title: "Beanie", sku: "", barcode: "" },
];

describe("what a built product could be in the shop", () => {
  it("places by barcode, SKU and handle, and says how", () => {
    const c = candidatesFor({ handle: "bent-90-2026", variants: [{ sku: "aa-166", barcode: "'874452900016" }] }, rows);
    expect(c.map((x) => x.id)).toEqual(["gid://1", "gid://2"]);
    expect(c[0].on).toEqual(["barcode 874452900016", "SKU AA-166", "handle"]);
    expect(c[1].on).toEqual(["barcode 874452900016"]);
    expect(describeCandidates(c)).toContain("Fits 2 products");
  });
  it("finds nothing for a product the shop has never sold", () => {
    expect(candidatesFor({ handle: "new-thing", variants: [{ sku: "X", barcode: "" }] }, rows)).toEqual([]);
  });
  it("never matches on an empty code", () => {
    expect(candidatesFor({ handle: "", variants: [{ sku: "", barcode: "" }] }, rows)).toEqual([]);
  });
});
