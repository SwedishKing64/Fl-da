import { describe, expect, it } from "vitest";
import { detectHeaderRow, extractCsv, gridToTable } from "./tabular";
import { extractHeuristic } from "./heuristic";
import { detectKind } from "./index";

describe("tabular extraction", () => {
  it("detects a header row below a preamble and dedupes header names", () => {
    const grid = [
      ["ACME SKI CO", "", ""],
      ["Invoice 1234", "", ""],
      ["SKU", "Description", "Qty", "Price", "Price"],
      ["A1", "Bent 90 172", "2", "450.00", "900.00"],
      ["", "", "", "", ""],
    ];
    expect(detectHeaderRow(grid)).toBe(2);
    const t = gridToTable(grid, "CSV");
    expect(t.headers).toEqual(["SKU", "Description", "Qty", "Price", "Price (2)"]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]["Price (2)"]).toBe("900.00");
    expect(t.warnings[0]).toMatch(/line 3/);
  });

  it("parses CSV with a BOM and quoted commas", () => {
    const t = extractCsv(Buffer.from('﻿SKU,Name,Cost\nA1,"Bent 90, Blue",450\n'));
    expect(t.headers).toEqual(["SKU", "Name", "Cost"]);
    expect(t.rows[0].Name).toBe("Bent 90, Blue");
  });

  it("detects file kinds", () => {
    expect(detectKind("inv.PDF", "application/octet-stream")).toBe("pdf");
    expect(detectKind("inv.xlsx", "")).toBe("xlsx");
    expect(detectKind("scan.jpg", "image/jpeg")).toBe("image");
    expect(detectKind("x.bin", "application/octet-stream")).toBe("unknown");
  });
});

describe("heuristic text extraction", () => {
  it("pulls code / description / qty / unit price lines and ignores totals", () => {
    const text = `ACME SKI CO  TAX INVOICE
SKU        Description                         Qty   Unit    Total
AA0029-172 Bent 90 Blue 172cm                   3   450.00  1,350.00
AB1234-26.5 Hawx Ultra 100 Boot size 26.5       2   320.00    640.00
Freight                                                 45.00
Subtotal                                             1,990.00`;
    const t = extractHeuristic(text);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toMatchObject({ SKU: "AA0029-172", Qty: "3", "Unit Price": "450.00", Length: "172", Colour: "Blue" });
    expect(t.rows[1]).toMatchObject({ SKU: "AB1234-26.5", Size: "26.5", Qty: "2" });
  });
});
