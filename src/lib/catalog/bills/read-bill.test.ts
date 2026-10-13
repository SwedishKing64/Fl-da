import { describe, expect, it } from "vitest";
import { asBill, gridAsText, readBill, readBillPage } from "./read-bill";

describe("reading an invoice as a bill", () => {
  it("sends the pages and takes the reading back as a bill", async () => {
    const seen: unknown[] = [];
    const ask = async (_system: string, content: unknown) => {
      seen.push(content);
      return JSON.stringify({
        supplier: " Head Oceania Pty Limited ", billNo: "3700388555", billDate: "2026-10-03", dueDate: "", terms: "30 days", currency: "aud", gstTreatment: "EXCLUSIVE",
        memo: "Closeout skis", lines: [{ description: "Kore 93 177", quantity: 2, unitPrice: 450, amount: 900, gst: null, kind: "goods" }, { description: "Freight", quantity: null, unitPrice: null, amount: 40, gst: null, kind: "freight" }],
        subtotal: 900, freight: null, gst: 94, total: 1034, unsure: [], startsInvoice: true, printedPage: null, printedPages: null,
      });
    };
    const bill = await readBill([{ kind: "text", text: "Sheet" }], "head.csv", { ask });
    expect(bill).toMatchObject({ source: "head.csv", supplier: "Head Oceania Pty Limited", currency: "AUD", freight: 40, subtotal: 900, gst: 94, total: 1034 });
    expect(seen).toHaveLength(1);
  });

  it("writes a spreadsheet out as lines of text for the reader", () => {
    expect(gridAsText("Invoice", [["Item", "Qty", " Amount "], ["", "", ""], ["Custom Camber", "3", "1560.00"]])).toBe('Sheet "Invoice", one row per line, cells separated by tabs:\nItem\tQty\tAmount\nCustom Camber\t3\t1560.00');
  });

  it("fills a freight figure in from a freight line", () => {
    const b = asBill({ supplier: "X", billNo: "1", billDate: "", dueDate: "", terms: "", currency: "", gstTreatment: "UNKNOWN", memo: "", lines: [{ description: "Freight", quantity: null, unitPrice: null, amount: 25, gst: null, kind: "freight" }], subtotal: null, freight: null, gst: null, total: null, unsure: [] }, "x.pdf");
    expect(b.freight).toBe(25);
    expect(b.currency).toBe("AUD");
  });

  it("reads one page of a batch and says where it sits in its invoice", async () => {
    const asked: string[] = [];
    const ask = async (_system: string, content: unknown) => {
      asked.push(JSON.stringify(content));
      return JSON.stringify({
        supplier: "Head Oceania", billNo: "INV-3700", billDate: "", dueDate: "", terms: "", currency: "AUD", gstTreatment: "EXCLUSIVE", memo: "",
        lines: [], subtotal: 1000, freight: null, gst: 100, total: 1100, unsure: [], startsInvoice: false, printedPage: 2, printedPages: 2,
      });
    };
    const { bill, mark } = await readBillPage({ kind: "text", text: "Page 2 of 2" }, "batch.pdf p.4", { ask });
    expect(bill).toMatchObject({ source: "batch.pdf p.4", billNo: "INV-3700", total: 1100 });
    expect(mark).toEqual({ startsInvoice: false, printedPage: 2, printedPages: 2 });
    expect(asked[0]).toMatch(/ONE page out of a scanned batch/);
  });
});
