import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { DEFAULT_OPTIONS, QUICKBOOKS_COLUMNS, billsFileName, checkBill, daysOf, dueDateFrom, qbDate, quickBooksCsv, quickBooksRows, type Bill } from "./quickbooks";

const burton: Bill = {
  source: "burton-INV-884512.pdf",
  supplier: "Burton Snowboards Australia Pty Ltd",
  billNo: "INV-884512",
  billDate: "2026-09-28",
  dueDate: "",
  terms: "30 days",
  currency: "AUD",
  gstTreatment: "EXCLUSIVE",
  memo: "Winter 27 snowboards, first delivery",
  lines: [
    { description: "Custom Camber 154", quantity: 3, unitPrice: 520, amount: 1560, gst: null, kind: "goods" },
    { description: "Custom Camber 158", quantity: 2, unitPrice: 520, amount: 1040, gst: null, kind: "goods" },
    { description: "Freight", quantity: null, unitPrice: null, amount: 60, gst: null, kind: "freight" },
  ],
  subtotal: 2600,
  freight: 60,
  gst: 266,
  total: 2926,
  unsure: [],
};

describe("a supplier's invoice as a QuickBooks bill", () => {
  it("writes one row for the goods and one for the freight, with the GST shared between them", () => {
    const rows = quickBooksRows(burton, DEFAULT_OPTIONS);
    expect(rows.map((r) => r.cells)).toEqual([
      ["INV-884512", "Burton Snowboards Australia Pty Ltd", "28/09/2026", "28/10/2026", "30 days", "", "Winter 27 snowboards, first delivery", "Purchases", "Winter 27 snowboards, first delivery", "2600.00", "GST", "260.00", "AUD"],
      ["INV-884512", "Burton Snowboards Australia Pty Ltd", "28/09/2026", "28/10/2026", "30 days", "", "Winter 27 snowboards, first delivery", "Freight", "Freight", "60.00", "GST", "6.00", "AUD"],
    ]);
  });

  it("writes a row per line when asked, with the printed GST shared out by amount", () => {
    const rows = quickBooksRows(burton, { ...DEFAULT_OPTIONS, detail: "lines" });
    expect(rows.map((r) => [r.cells[8], r.cells[9], r.cells[11]])).toEqual([
      ["Custom Camber 154", "1560.00", "156.00"],
      ["Custom Camber 158", "1040.00", "104.00"],
      ["Freight", "60.00", "6.00"],
    ]);
  });

  it("puts the GST into the amount when the company enters bills inclusive", () => {
    const rows = quickBooksRows(burton, { ...DEFAULT_OPTIONS, amounts: "inclusive" });
    expect(rows[0].cells[9]).toBe("2860.00");
    expect(rows[0].cells[11]).toBe("260.00");
  });

  it("marks an overseas supplier's bill as GST free", () => {
    const abroad: Bill = { ...burton, supplier: "Burton Corporation", currency: "USD", gstTreatment: "NONE", gst: 0, total: 2660 };
    const rows = quickBooksRows(abroad, DEFAULT_OPTIONS);
    expect(rows[0].cells.slice(9)).toEqual(["2600.00", "GST free", "0.00", "USD"]);
  });

  it("makes one file of several bills under QuickBooks' headings", () => {
    const grid = parseCsv(quickBooksCsv([burton, { ...burton, billNo: "INV-884600", lines: [], subtotal: 100, freight: 0, gst: 10, total: 110 }], DEFAULT_OPTIONS));
    expect(grid[0]).toEqual([...QUICKBOOKS_COLUMNS]);
    expect(grid.slice(1).map((r) => r[0])).toEqual(["INV-884512", "INV-884512", "INV-884600"]);
  });

  it("says what is wrong with a bill rather than leaving it out", () => {
    expect(checkBill(burton)).toEqual([]);
    expect(checkBill({ ...burton, supplier: "", billNo: "", billDate: "28 Sept" })).toEqual([
      "No supplier name. QuickBooks needs the supplier as it is set up there.",
      "No bill number.",
      'The bill date "28 Sept" is not a date that can be written out. Use YYYY-MM-DD.',
    ]);
    expect(checkBill({ ...burton, total: 2900 })).toEqual(["Goods 2600.00 plus freight 60.00 plus GST comes to 2926.00, but the total reads 2900.00."]);
    expect(checkBill({ ...burton, subtotal: 2500 })[0]).toBe("The lines add up to 2600.00 but the subtotal reads 2500.00.");
    expect(checkBill({ ...burton, unsure: ["total: 2926, or 2920"] })).toEqual(["Check: total: 2926, or 2920"]);
  });

  it("writes dates the way the company's QuickBooks reads them, and works a due date from the terms", () => {
    expect(qbDate("2026-09-28", "dmy")).toBe("28/09/2026");
    expect(qbDate("2026-09-28", "mdy")).toBe("09/28/2026");
    expect(qbDate("2026-09-28", "ymd")).toBe("2026-09-28");
    expect(qbDate("28 Sept 26", "dmy")).toBe("28 Sept 26");
    expect(daysOf("Net 60")).toBe(60);
    expect(daysOf("14 days from invoice")).toBe(14);
    expect(daysOf("")).toBe(30);
    expect(dueDateFrom("2026-12-20", "Net 30")).toBe("2027-01-19");
    expect(dueDateFrom("December", "")).toBe("");
  });

  it("names the file for the supplier when there is one", () => {
    expect(billsFileName([burton], new Date("2026-10-12T00:00:00Z"))).toBe("quickbooks-bills-burton-2026-10-12.csv");
    expect(billsFileName([burton, { ...burton, supplier: "Head Oceania" }], new Date("2026-10-12T00:00:00Z"))).toBe("quickbooks-bills-2026-10-12.csv");
  });
});
