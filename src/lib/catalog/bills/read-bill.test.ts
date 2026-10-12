import { describe, expect, it } from "vitest";
import { asBill, gridAsText, readBill } from "./read-bill";

describe("reading an invoice as a bill", () => {
  it("sends the pages and takes the reading back as a bill", async () => {
    const seen: unknown[] = [];
    const ask = async (_system: string, content: unknown) => {
      seen.push(content);
      return JSON.stringify({
        supplier: " Head Oceania Pty Limited ", billNo: "3700388555", billDate: "2026-10-03", dueDate: "", terms: "30 days", currency: "aud", gstTreatment: "EXCLUSIVE",
        memo: "Closeout skis", lines: [{ description: "Kore 93 177", quantity: 2, unitPrice: 450, amount: 900, gst: null, kind: "goods" }, { description: "Freight", quantity: null, unitPrice: null, amount: 40, gst: null, kind: "freight" }],
        subtotal: 900, freight: null, gst: 94, total: 1034, unsure: [],
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
});
