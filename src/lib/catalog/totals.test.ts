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
