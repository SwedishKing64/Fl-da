import { describe, expect, it } from "vitest";
import type { Bill } from "./quickbooks";
import { groupPages, sameNumber, type ReadPage } from "./split";

const blank: Bill = { source: "", supplier: "", billNo: "", billDate: "", dueDate: "", terms: "", currency: "AUD", gstTreatment: "UNKNOWN", memo: "", lines: [], subtotal: null, freight: null, gst: null, total: null, unsure: [] };
const line = (description: string, amount: number) => ({ description, quantity: 1, unitPrice: amount, amount, gst: null, kind: "goods" as const });
const page = (n: number, bill: Partial<Bill>, mark: Partial<ReadPage["mark"]> = {}): ReadPage => ({
  page: n,
  bill: { ...blank, ...bill },
  mark: { startsInvoice: false, printedPage: null, printedPages: null, ...mark },
});

describe("a scanned batch of invoices", () => {
  it("makes one bill per invoice, a three-page one included, with its totals off the last page", () => {
    const bills = groupPages("batch.pdf", [
      page(1, { supplier: "Outdoor Agencies", billNo: "276100", billDate: "2026-09-07", gstTreatment: "EXCLUSIVE", lines: [line("Exos 58", 300)], total: 330, gst: 30 }, { startsInvoice: true }),
      page(2, { supplier: "Head Oceania", billNo: "INV-3700", billDate: "2026-09-08", lines: [line("Kore 93", 500)] }, { startsInvoice: true, printedPage: 1, printedPages: 3 }),
      page(3, { supplier: "Head Oceania", billNo: "INV-3700", lines: [line("Kore 99", 500)] }, { printedPage: 2, printedPages: 3 }),
      page(4, { lines: [line("Freight", 40)], subtotal: 1000, freight: 40, gst: 104, total: 1144 }, { printedPage: 3, printedPages: 3 }),
      page(5, { supplier: "Rossignol Australia", billNo: "88123", total: 220, gst: 20 }, { startsInvoice: true }),
    ]);
    expect(bills.map((b) => [b.supplier, b.billNo, b.total, b.gst, b.source])).toEqual([
      ["Outdoor Agencies", "276100", 330, 30, "batch.pdf p.1"],
      ["Head Oceania", "INV-3700", 1144, 104, "batch.pdf pp.2–4"],
      ["Rossignol Australia", "88123", 220, 20, "batch.pdf p.5"],
    ]);
    expect(bills[1].lines.map((l) => l.description)).toEqual(["Kore 93", "Kore 99", "Freight"]);
    expect(bills[1].billDate).toBe("2026-09-08");
  });

  it("starts a new bill at a new invoice number from the same supplier, even with no first-page sign", () => {
    const bills = groupPages("b.pdf", [
      page(1, { supplier: "Burton", billNo: "1001", total: 110 }, { startsInvoice: true }),
      page(2, { supplier: "Burton", billNo: "1002", total: 220 }),
    ]);
    expect(bills.map((b) => b.billNo)).toEqual(["1001", "1002"]);
  });

  it("keeps a page with the same number written differently on its invoice", () => {
    const bills = groupPages("b.pdf", [
      page(1, { supplier: "Burton", billNo: "INV-001001" }, { startsInvoice: true }),
      page(2, { supplier: "Burton", billNo: "1001", total: 110 }, { startsInvoice: true }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].total).toBe(110);
  });

  it("starts afresh after a page that said it was the last of its invoice", () => {
    const bills = groupPages("b.pdf", [
      page(1, { supplier: "Head", billNo: "1", total: 100 }, { startsInvoice: true, printedPage: 1, printedPages: 1 }),
      page(2, { supplier: "Salomon", total: 50 }),
    ]);
    expect(bills.map((b) => b.supplier)).toEqual(["Head", "Salomon"]);
  });

  it("drops a blank page at the front and carries one in the middle with its invoice", () => {
    const bills = groupPages("b.pdf", [
      page(1, {}),
      page(2, { supplier: "Head", billNo: "1" }, { startsInvoice: true }),
      page(3, {}),
      page(4, { supplier: "Head", billNo: "1", total: 100 }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].source).toBe("b.pdf pp.2–4");
  });

  it("compares invoice numbers without their dressing", () => {
    expect(sameNumber("INV-0042", "42")).toBe(true);
    expect(sameNumber("# 276 122", "276122")).toBe(true);
    expect(sameNumber("276122", "276123")).toBe(false);
    expect(sameNumber("", "")).toBe(false);
  });
});
