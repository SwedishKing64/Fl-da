import { describe, expect, it } from "vitest";
import { invoiceOf, joinOrderAndInvoice } from "./order-and-invoice";
import type { InvoiceLine } from "./reconcile";

const line = (p: Partial<InvoiceLine>): InvoiceLine => ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...p });

describe("an order form and its invoice", () => {
  const form = [
    line({ sku: "TR-100", barcode: "9300000000017", title: "Trail Runner Jacket", size: "M", colour: "Black", rrp: 299.95, costPrice: 150, quantity: 2 }),
    line({ sku: "TR-100", barcode: "9300000000024", title: "Trail Runner Jacket", size: "L", colour: "Black", rrp: 299.95, costPrice: 150, quantity: 2 }),
    line({ sku: "SUM-2", barcode: "9300000000031", title: "Summit Pant", size: "M", rrp: 199.95, costPrice: 100, quantity: 3 }),
  ];
  const invoice = [
    line({ sku: "TR-100", title: "TRAIL RUNNER JKT", size: "M", colour: "BLK", costPrice: 135, quantity: 1 }),
    line({ sku: "TR-100", title: "TRAIL RUNNER JKT", size: "L", colour: "BLK", costPrice: 135, quantity: 2 }),
  ];

  it("takes what arrived and its cost from the invoice, and the barcode and retail from the form", () => {
    const j = joinOrderAndInvoice(form, invoice);
    expect(j.matched).toBe(2);
    expect(j.lines[0]).toMatchObject({ quantity: 1, costPrice: 135, barcode: "9300000000017", rrp: 299.95, title: "Trail Runner Jacket", size: "M" });
    expect(j.lines[1]).toMatchObject({ quantity: 2, costPrice: 135, barcode: "9300000000024" });
    expect(j.notShipped.map((l) => l.title)).toEqual(["Summit Pant"]);
  });

  it("matches by name where the invoice has no code", () => {
    const j = joinOrderAndInvoice(form, [line({ title: "Summit Pant", size: "M", costPrice: 90, quantity: 3 })]);
    expect(j.lines[0]).toMatchObject({ barcode: "9300000000031", rrp: 199.95, costPrice: 90, quantity: 3 });
  });

  it("tells the invoice from the order form", () => {
    expect(invoiceOf({ name: "Burton order confirmation.xlsx", lines: 40 }, { name: "INV-2231.pdf", lines: 12 }).invoice.name).toBe("INV-2231.pdf");
    expect(invoiceOf({ name: "Tax Invoice 5521.xlsx", lines: 30 }, { name: "Indent W26.xlsx", lines: 30 }).invoice.name).toBe("Tax Invoice 5521.xlsx");
  });
});
