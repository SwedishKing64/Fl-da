import { describe, expect, it } from "vitest";
import { groupIssues } from "./issue-groups";

describe("the export's notes, grouped", () => {
  it("says each thing once, with the products it is on and how many lines it stood for", () => {
    const groups = groupIssues([
      "Photon Boots 2026 / (no sku): No recommended retail",
      "Photon Boots 2026 / (no sku): No recommended retail",
      "Ruler Boots 2026 / A-1: No recommended retail",
      "Ruler Boots 2026: No image - add one or export anyway",
      "Something said of the whole batch",
    ]);
    expect(groups[0]).toEqual({ message: "No recommended retail", products: ["Photon Boots 2026", "Ruler Boots 2026"], count: 3 });
    expect(groups.map((g) => g.message)).toContain("Something said of the whole batch");
  });
});
