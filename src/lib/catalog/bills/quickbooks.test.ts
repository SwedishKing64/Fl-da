import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DEFAULT_OPTIONS, QUICKBOOKS_COLUMNS, billsFileName, checkBill, daysOf, dueDateFrom, quickBooksRow, quickBooksWorkbook, type Bill } from "./quickbooks";

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
  it("writes the whole bill as one row of the shop's sheet, GST in the amount", () => {
    expect(quickBooksRow(burton, DEFAULT_OPTIONS)).toEqual({
      supplier: "Burton Snowboards Australia Pty Ltd",
      billNo: "INV-884512",
      billDate: "2026-09-28",
      dueDate: "2026-10-28",
      category: "Cost of sales:Stock Purchase",
      description: "",
      amount: 2926,
      gst: 266,
    });
  });

  it("keeps a plain invoice number as a number, and adds the bill up where no total is printed", () => {
    const row = quickBooksRow({ ...burton, billNo: "276100", total: null, gst: null }, DEFAULT_OPTIONS);
    expect(row.billNo).toBe(276100);
    expect(row.gst).toBe(266);
    expect(row.amount).toBe(2926);
    expect(quickBooksRow({ ...burton, billNo: "007" }, DEFAULT_OPTIONS).billNo).toBe("007");
  });

  it("takes the GST out of an invoice whose prices include it, and none from an overseas one", () => {
    expect(quickBooksRow({ ...burton, gstTreatment: "INCLUSIVE", gst: null, total: 1100 }, DEFAULT_OPTIONS)).toMatchObject({ amount: 1100, gst: 100 });
    expect(quickBooksRow({ ...burton, gstTreatment: "NONE", gst: null, total: 2660 }, DEFAULT_OPTIONS)).toMatchObject({ amount: 2660, gst: 0 });
  });

  it("makes the shop's sheet: its headings, one row a bill, dates as dates, money to two places", async () => {
    const file = await quickBooksWorkbook([burton, { ...burton, supplier: "Outdoor Agencies", billNo: "276100", billDate: "2026-09-07", dueDate: "2026-10-30", total: 1100, gst: 100 }], { category: "" });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file);
    const sheet = book.getWorksheet("Sheet1")!;
    expect(sheet.rowCount).toBe(3);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...QUICKBOOKS_COLUMNS]);
    const row = sheet.getRow(3);
    expect(row.getCell(1).value).toBe("Outdoor Agencies");
    expect(row.getCell(2).value).toBe(276100);
    expect(row.getCell(3).value).toEqual(new Date(Date.UTC(2026, 8, 7)));
    expect(row.getCell(4).value).toEqual(new Date(Date.UTC(2026, 9, 30)));
    expect(row.getCell(5).value).toBe("Cost of sales:Stock Purchase");
    expect(row.getCell(7).value).toBe(1100);
    expect(row.getCell(8).value).toBe(100);
    expect(row.getCell(7).numFmt).toBe("0.00");
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

  it("works a due date from the terms", () => {
    expect(daysOf("Net 60")).toBe(60);
    expect(daysOf("14 days from invoice")).toBe(14);
    expect(daysOf("")).toBe(30);
    expect(dueDateFrom("2026-12-20", "Net 30")).toBe("2027-01-19");
    expect(dueDateFrom("December", "")).toBe("");
  });

  it("names the file for the supplier when there is one", () => {
    expect(billsFileName([burton], new Date("2026-10-12T00:00:00Z"))).toBe("quickbooks-bills-burton-2026-10-12.xlsx");
    expect(billsFileName([burton, { ...burton, supplier: "Head Oceania" }], new Date("2026-10-12T00:00:00Z"))).toBe("quickbooks-bills-2026-10-12.xlsx");
  });
});
