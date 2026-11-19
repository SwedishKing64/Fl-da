import { describe, expect, it } from "vitest";
import { layoutOf, layoutOfHeaders, sameLayout } from "./layout";
import { answerOptions, examplesPrompt, pickExamples, printedLine, type ReadExample } from "./read-examples";

const INVOICE = `Ridgeway Outdoor Pty Ltd
Tax Invoice 10442      Date 14/10/2026
Please pay within 30 days of the invoice date and quote the invoice number.

Item Code   Description              Colour  Size  Qty  Unit Price   Amount
RW-FL-210   Ridge Fleece Jacket      BLK     M     2    64.00        128.00
RW-FL-210   Ridge Fleece Jacket      BLK     L     1    64.00         64.00
TP-2P-GRN   Trailhead 2P Tent        GRN           1    212.00       212.00
                                                  Subtotal           404.00`;

describe("a document's layout", () => {
  it("is the words of its column heading line, sorted", () => {
    expect(layoutOf(INVOICE)).toBe("amount code colour description item price qty size unit");
  });

  it("is not a sentence that mentions prices and quantities", () => {
    expect(layoutOf("Please check the quantity and price of each item against your order")).toBeNull();
  });

  it("is a spreadsheet's headings", () => {
    expect(layoutOfHeaders(["SKU", "Name", "Qty", "Cost"])).toBe("cost name qty sku");
  });

  it("stays the same when the supplier adds a column now and then", () => {
    const withDiscount = layoutOf(INVOICE.replace("Unit Price   Amount", "Unit Price  Disc  Amount"));
    expect(sameLayout(layoutOf(INVOICE), withDiscount)).toBe(true);
    expect(sameLayout(layoutOf(INVOICE), "barcode cost ean name qty rrp sku")).toBe(false);
  });
});

describe("how a supplier's lines were read before", () => {
  const example = (code: string, name: string, layout: string | null): ReadExample => ({ printed: `${code} ${name}`, read: { code, name, quantity: 1, cost: 10 }, layout });

  it("finds the printed line by its code, and nothing for a code too short to tell", () => {
    expect(printedLine(INVOICE, { code: "TP-2P-GRN" })).toBe("TP-2P-GRN Trailhead 2P Tent GRN 1 212.00 212.00");
    expect(printedLine(INVOICE, { code: "12" })).toBeNull();
  });

  it("reads a variant's options as size, colour and the rest", () => {
    expect(answerOptions(["Colour", "Size", "Capacity"], ["Black", "M", "2P"])).toEqual({ colour: "Black", size: "M", option: "2P" });
    expect(answerOptions(["Title", null, null], ["Default Title", null, null])).toEqual({});
  });

  it("gives the same layout's lines first, one per product", () => {
    const picked = pickExamples([example("A1", "Fleece", "old"), example("B1", "Tent", "new"), example("B2", "Tent", "new"), example("C1", "Pack", "new")], "new", 3);
    expect(picked.map((e) => e.read.code)).toEqual(["B1", "C1", "A1"]);
  });

  it("tells the reader each line and what it was settled as", () => {
    const text = examplesPrompt([{ printed: "RW-FL-210 Ridge Fleece Jacket BLK M 2 64.00 128.00", read: { code: "RW-FL-210", name: "Ridge Fleece Jacket", quantity: 2, cost: 64, colour: "Black", size: "M" }, layout: null }]);
    expect(text).toContain(`"RW-FL-210 Ridge Fleece Jacket BLK M 2 64.00 128.00" was read as code RW-FL-210, title Ridge Fleece Jacket, colour Black, size M, quantity 2, cost 64.`);
    expect(examplesPrompt([])).toBe("");
  });
});

describe("reading a known supplier's document", () => {
  const history = { examples: [{ printed: "RW-FL-210 Ridge Fleece Jacket BLK M 2 64.00 128.00", read: { code: "RW-FL-210", name: "Ridge Fleece Jacket", quantity: 2, cost: 64 }, layout: layoutOf(INVOICE) }], layouts: [layoutOf(INVOICE)!] };

  it("keeps the lighter model for a layout it has sent before, with its lines as examples", async () => {
    const { readFor } = await import("./extract");
    const { read, note } = readFor({ known: true }, history, layoutOf(INVOICE));
    expect(read.known).toBe(true);
    expect(read.guide).toContain("RW-FL-210");
    expect(note).toBeNull();
  });

  it("reads a layout it has never sent in full, and says so", async () => {
    const { readFor } = await import("./extract");
    const { read, note } = readFor({ known: true }, history, "barcode cost ean name qty rrp sku");
    expect(read.known).toBe(false);
    expect(note).toMatch(/not sent before/);
  });
});
