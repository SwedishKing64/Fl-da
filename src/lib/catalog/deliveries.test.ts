import { describe, expect, it } from "vitest";
import { deliveryAsked, dueInWindow, narrowToWindow, parseWindow, yearMonth } from "./deliveries";
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
    // A year alone is the whole year.
    expect(parseWindow("2026")).toEqual({ from: { year: 2026, month: 1 }, to: { year: 2026, month: 12 } });
    expect(parseWindow("26")).toEqual({ from: { year: 2026, month: 1 }, to: { year: 2026, month: 12 } });
  });

  it("reads the dates suppliers write", () => {
    expect(yearMonth("2026-04-01")).toEqual({ year: 2026, month: 4 });
    expect(yearMonth("Dec 26")).toEqual({ year: 2026, month: 12 });
    expect(yearMonth("December 2026")).toEqual({ year: 2026, month: 12 });
    expect(yearMonth("OCT")).toEqual({ year: null, month: 10 });
    expect(yearMonth("15/04/2026")).toEqual({ year: 2026, month: 4 });
    expect(yearMonth("TOTALS")).toBeNull();
    // Burton's estimated-delivery column says "26" or "27" and nothing more.
    expect(yearMonth("26")).toEqual({ year: 2026, month: 0 });
    expect(yearMonth("2027")).toEqual({ year: 2027, month: 0 });
    expect(yearMonth("W27")).toEqual({ year: 2027, month: 0 });
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

  it("takes a year alone, against a whole-year window", () => {
    const this26 = { ...emptyLineItem(), quantity: 4, deliveryDate: "26" };
    const next27 = { ...emptyLineItem(), quantity: 4, deliveryDate: "27" };
    expect(dueInWindow(this26, parseWindow("2026")!).quantity).toBe(4);
    expect(dueInWindow(next27, parseWindow("2026")!).quantity).toBe(0);
    // A line with a full date is still judged by its month against a whole-year window.
    expect(dueInWindow({ ...emptyLineItem(), quantity: 1, deliveryDate: "2026-11-15" }, parseWindow("2026")!).quantity).toBe(1);
    expect(dueInWindow({ ...emptyLineItem(), quantity: 1, deliveryDate: "2027-01-15" }, parseWindow("2026")!).quantity).toBe(0);
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

describe("a delivery asked for in an instruction", () => {
  it("hears which delivery, and only when a delivery is what is being spoken about", () => {
    expect(deliveryAsked("only the December 2026 delivery")).toBe("december 2026");
    expect(deliveryAsked("I only want what has an estimated delivery of 26")).toBe("2026");
    expect(deliveryAsked("just the lines due in 2026")).toBe("2026");
    expect(deliveryAsked("first delivery only")).toBe("first");
    expect(deliveryAsked("only the Nov to Dec 26 deliveries")).toBe("2026-11..2026-12");
    // A year said about something else is not a delivery window.
    expect(deliveryAsked("put the 2026 jackets 30% off")).toBeNull();
    expect(deliveryAsked("tag everything 2998")).toBeNull();
    for (const said of ["only the December 2026 delivery", "only what has an estimated delivery of 26", "first delivery only", "only the Nov to Dec 26 deliveries"]) {
      expect(parseWindow(deliveryAsked(said)!)).not.toBeNull();
    }
  });

  it("narrows an order to the lines due, at that delivery's quantity, keeping the lines that give no date", () => {
    const lines = [
      { title: "a", quantity: 3, deliveryDate: "2026-11-15" },
      { title: "b", quantity: 2, deliveryDate: "2027-04-01" },
      { title: "c", quantity: 5, due: { "2026-12": 2, "2027-01": 3 } },
      { title: "d", quantity: 1 },
    ];
    const out = narrowToWindow(lines, parseWindow("2026")!);
    expect(out.lines.map((l) => [l.title, l.quantity])).toEqual([["a", 3], ["c", 2], ["d", 1]]);
    expect(out.undated).toBe(1);
  });
});
