import { describe, expect, it } from "vitest";
import { disguiseFactor, disguiseGrid, disguiseText, headingRow, isMoneyHeading, scaleAmount } from "./redact";
import { checkTotals } from "./totals";

describe("disguising a supplier document's money", () => {
  it("picks a factor well away from the real figures", () => {
    for (const r of [0, 0.2, 0.49, 0.5, 0.8, 0.999]) {
      const f = disguiseFactor(() => r);
      expect(f < 0.86 || f > 1.14).toBe(true);
      expect(f).toBeGreaterThan(0.5);
      expect(f).toBeLessThan(1.5);
    }
  });

  it("scales an amount and writes it back the way it was written", () => {
    expect(scaleAmount("$1,649.00", 0.6)).toBe("$989.40");
    expect(scaleAmount("189.00", 1.2)).toBe("226.80");
    expect(scaleAmount("1649", 0.6)).toBe("989");
    expect(scaleAmount("Black", 0.6)).toBe("Black");
  });

  it("knows a money heading from a quantity, a discount or a code", () => {
    for (const h of ["Unit Price", "Cost Ex GST", "RRP", "Line Total", "W/S", "Amount"]) expect(isMoneyHeading(h)).toBe(true);
    for (const h of ["Qty", "Disc %", "Item Code", "EAN", "Size"]) expect(isMoneyHeading(h)).toBe(false);
  });

  it("disguises every price and total, leaves codes and quantities, and keeps the arithmetic", () => {
    const grid = [
      ["Ridgeway Outdoor", "", "", "", ""],
      ["Item Code", "Description", "Qty", "Unit Price", "Line Total"],
      ["4006050123456", "Atlas Trek Pack 65L", "2", "189.00", "378.00"],
      ["RW-FL-210", "Ridge Fleece Jacket", "3", "64.00", "192.00"],
      ["", "Subtotal", "", "", "$570.00"],
    ];
    expect(headingRow(grid)).toBe(1);
    const out = disguiseGrid(grid, 0.7);
    expect(out[2][0]).toBe("4006050123456");
    expect(out[2][2]).toBe("2");
    expect(out[2][3]).toBe("132.30");
    expect(out[3][4]).toBe("134.40");
    expect(out[4][4]).toBe("$399.00");
    const check = checkTotals([{ quantity: 2, costPrice: 132.3 }, { quantity: 3, costPrice: 44.8 }], { units: 5, subtotal: 399 });
    expect(check.ok).toBe(true);
  });

  it("disguises the amounts in a PDF's text and nothing else", () => {
    expect(disguiseText("TP-2P-GRN Trailhead 2P Tent 1 212.00 212.00\nTotal Units 1", 1.25)).toBe("TP-2P-GRN Trailhead 2P Tent 1 265.00 265.00\nTotal Units 1");
  });
});
