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

describe("an order form and its invoice in one batch", () => {
  const item = (p: Partial<{ title: string; sku: string; barcode: string; size: string; colour: string; quantity: number | null; costPrice: number | null; rrp: number | null }>) => ({
    title: "", sku: "", barcode: "", size: "", length: "", colour: "", quantity: null, costPrice: null, rrp: null, modelCode: "", description: "", imageUrls: [] as string[], brand: "", season: "", gender: "", ...p,
  });
  const form = [item({ sku: "A1", size: "M", barcode: "9300000000017", rrp: 99.95, quantity: 4 }), item({ sku: "A1", size: "L", barcode: "9300000000024", rrp: 99.95, quantity: 4 })];
  const invoice = [item({ sku: "A1", size: "M", costPrice: 40, quantity: 3 }), item({ sku: "A1", size: "L", costPrice: 40, quantity: 4 })];

  it("are the same goods, and the invoice's lines take what the form knows", async () => {
    const { overlapOf, fillFromForm, formAndInvoice } = await import("./order-and-invoice");
    expect(overlapOf(form, invoice)).toBe(1);
    expect(formAndInvoice({ name: "Summer order.xlsx", lines: form }, { name: "INV 551.pdf", lines: invoice })).toBe(true);
    const filled = fillFromForm(form, invoice);
    expect(filled.matched).toBe(2);
    expect(filled.lines[0]).toMatchObject({ quantity: 3, costPrice: 40, barcode: "9300000000017", rrp: 99.95 });
  });

  it("are not two shipments of one order", async () => {
    const { formAndInvoice } = await import("./order-and-invoice");
    expect(formAndInvoice({ name: "INV 550.pdf", lines: invoice }, { name: "INV 551.pdf", lines: invoice })).toBe(false);
  });
});
