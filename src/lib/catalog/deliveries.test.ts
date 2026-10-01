import { describe, expect, it } from "vitest";
import { dueInWindow, parseWindow, yearMonth } from "./deliveries";
import { foldQuantityColumns } from "./invoice";
import { applyMapping, suggestMapping } from "./mapping";
import { emptyLineItem } from "./types";

describe("a delivery window as somebody says it", () => {
  it("reads a month, a span, or an ordinal", () => {
    expect(parseWindow("2026-12")).toEqual({ from: { year: 2026, month: 12 }, to: { year: 2026, month: 12 } });
    expect(parseWindow("2026-12..2027-01")).toEqual({ from: { year: 2026, month: 12 }, to: { year: 2027, month: 1 } });
    expect(parseWindow("first")).toEqual({ ordinal: 1 });
    expect(parseWindow("second delivery")).toEqual({ ordinal: 2 });
    expect(parseWindow("whenever")).toBeNull();
  });

  it("reads the dates suppliers write", () => {
    expect(yearMonth("2026-04-01")).toEqual({ year: 2026, month: 4 });
    expect(yearMonth("Dec 26")).toEqual({ year: 2026, month: 12 });
    expect(yearMonth("December 2026")).toEqual({ year: 2026, month: 12 });
    expect(yearMonth("OCT")).toEqual({ year: null, month: 10 });
    expect(yearMonth("15/04/2026")).toEqual({ year: 2026, month: 4 });
    expect(yearMonth("TOTALS")).toBeNull();
  });
});

describe("how many of a line are due in the window", () => {
  it("takes the delivery's own column where the form has one per delivery", () => {
    const item = { ...emptyLineItem(), quantity: 3, extras: { "Due 2026-12": "1", "Due 2027-06": "2" } };
    expect(dueInWindow(item, parseWindow("2026-12")!).quantity).toBe(1);
    expect(dueInWindow(item, parseWindow("2027-06")!).quantity).toBe(2);
    expect(dueInWindow(item, parseWindow("2027-01")!).quantity).toBe(0);
    expect(dueInWindow(item, parseWindow("second")!).quantity).toBe(2);
  });

  it("goes by the line's date, all or nothing, where the form dates each line", () => {
    const april = { ...emptyLineItem(), quantity: 2, deliveryDate: "2026-04-01" };
    const november = { ...emptyLineItem(), quantity: 2, deliveryDate: "2025-11-15" };
    expect(dueInWindow(april, parseWindow("2026-04")!).quantity).toBe(2);
    expect(dueInWindow(november, parseWindow("2026-04")!).quantity).toBe(0);
  });

  it("says so when the line does not say when it is due", () => {
    expect(dueInWindow({ ...emptyLineItem(), quantity: 2 }, parseWindow("2026-04")!).quantity).toBeNull();
  });
});

describe("a form with a quantity column per delivery month", () => {
  it("keeps each delivery's quantity under the delivery it is for", () => {
    const months = ["", "", "2026-12-01", "2026-12-01", "2027-06-01", "2027-06-01", "TOTALS", "TOTALS"];
    const head = ["EAN", "Style Name", "Units", "W/S $", "Units", "W/S $", "Units", "W/S $"];
    const grid = [months, head, ["7042040699045", "ALPHA JACKET", "", "", "1", "386", "1", "386"], ["7042040699038", "ALPHA JACKET", "1", "386", "1", "386", "2", "772"]];
    const { grid: out } = foldQuantityColumns(grid, 1);
    expect(out[1].slice(8)).toEqual(["Due 2026-12", "Due 2027-06"]);
    expect(out[2].slice(8)).toEqual(["", "1"]);
    expect(out[3].slice(8)).toEqual(["1", "1"]);
    expect(out[3][2]).toBe("2");
    // And they ride through the mapping as the line's extras, not as its quantity.
    const headers = out[1];
    const rows = out.slice(2).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
    const mapping = suggestMapping(headers, rows);
    expect(mapping["Units"]).toBe("quantity");
    expect(mapping["Due 2026-12"]).toBe("");
    const item = applyMapping(rows[1], mapping);
    expect(item.quantity).toBe(2);
    expect(dueInWindow(item, parseWindow("2026-12")!).quantity).toBe(1);
  });
});
