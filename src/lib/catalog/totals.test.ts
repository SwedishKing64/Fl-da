import { describe, expect, it } from "vitest";
import { checkTotals, totalsDistance } from "./totals";

const lines = [{ quantity: 2, costPrice: 50 }, { quantity: 1, costPrice: 120 }];

describe("checkTotals", () => {
  it("passes lines that add up to the document's totals", () => {
    const c = checkTotals(lines, { units: 3, subtotal: 220 });
    expect(c.ok).toBe(true);
    expect(c.checked).toBe(true);
    expect(c.message).toBe("");
  });
  it("says what does not add up", () => {
    const c = checkTotals(lines, { units: 4, subtotal: 270 });
    expect(c.ok).toBe(false);
    expect(c.message).toContain("3 units against the 4 it states");
    expect(c.message).toContain("$220.00 against the $270.00 it states");
  });
  it("allows a subtotal that rounds per line", () => {
    expect(checkTotals([{ quantity: 3, costPrice: 33.333 }], { units: null, subtotal: 100 }).ok).toBe(true);
  });
  it("is not a failure when the document states nothing", () => {
    const c = checkTotals(lines, { units: null, subtotal: null });
    expect(c.ok).toBe(true);
    expect(c.checked).toBe(false);
  });
  it("prefers the read that comes closer", () => {
    const near = checkTotals(lines, { units: 4, subtotal: null });
    const far = checkTotals(lines, { units: 9, subtotal: null });
    expect(totalsDistance(near)).toBeLessThan(totalsDistance(far));
  });
});

describe("a file that does not add up, once the person has looked", () => {
  const note = "Does not add up: The lines read add up to 11 units: a line may be missing, doubled or misread. Check the lines against the document before building. Could not tell whether prices include GST.";

  it("says what is off until it is settled, and keeps the file's other notes", async () => {
    const { offTotals, settledTotals } = await import("./totals");
    expect(offTotals(note)).toMatch(/^The lines read add up to 11 units/);
    expect(settledTotals(note)).toBe("Could not tell whether prices include GST.");
    expect(offTotals(settledTotals(note))).toBeNull();
    expect(settledTotals("Does not add up: x. Check the lines against the document before building.")).toBeNull();
  });
});
