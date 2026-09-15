import { describe, expect, it } from "vitest";
import { withRule } from "./feedback";

describe("turning a correction into a standing rule", () => {
  it("adds the instruction to what is already there", () => {
    expect(withRule("Tag every product with the house tag.", "Goggles from snowboard brands are Snowboard Accessories."))
      .toBe("Tag every product with the house tag.\nGoggles from snowboard brands are Snowboard Accessories.");
  });

  it("starts the list when there is nothing yet", () => {
    expect(withRule("", "Ski titles carry the season year.")).toBe("Ski titles carry the season year.");
  });

  /** The same correction twice should not leave the shop with the same line twice. */
  it("does not add an instruction the shop already has", () => {
    const rules = "Ski titles carry the season year.";
    expect(withRule(rules, "ski titles carry the season year.")).toBe(rules);
    expect(withRule(rules, "  Ski   titles carry the season year. ")).toBe(rules);
  });

  it("ignores an empty proposal", () => {
    expect(withRule("Existing.", "   ")).toBe("Existing.");
  });
});
