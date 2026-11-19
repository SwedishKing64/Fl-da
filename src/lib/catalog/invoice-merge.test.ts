import { describe, expect, it } from "vitest";
import { invoiceFirst, mergeInvoiceWithOrder } from "./invoice-merge";
import type { InvoiceLine } from "./reconcile";

const line = (over: Partial<InvoiceLine>): InvoiceLine => ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...over });

describe("an invoice read with the order sheet it was shipped against", () => {
  const order = [
    line({ sku: "105441CA02RG00M", barcode: "9009521000017", title: "CARTEL X RE:FLEX", size: "M", colour: "White", quantity: 2, costPrice: 250, rrp: 549.95, kind: "BINDINGS" }),
    line({ sku: "105441CA02RG00L", barcode: "9009521000024", title: "CARTEL X RE:FLEX", size: "L", colour: "White", quantity: 2, costPrice: 250, rrp: 549.95, kind: "BINDINGS" }),
    line({ sku: "106581ZZ01RG090", barcode: "", title: "PHOTON BOA", size: "9", colour: "Black", quantity: 1, costPrice: 330, rrp: 699.95, kind: "BOOTS" }),
  ];

  it("takes the count and cost from the invoice, and the rest from the order", () => {
    const invoice = [
      line({ barcode: "9009521000017", title: "M CARTEL X EST WH", quantity: 1, costPrice: 262.5 }),
      line({ sku: "106581ZZ01RG090", title: "PHOTON BOA BLK 9", size: "9", quantity: 1, costPrice: 330 }),
    ];
    const r = mergeInvoiceWithOrder(invoice, order);
    expect(r.paired).toBe(2);
    expect(r.lines[0]).toMatchObject({ barcode: "9009521000017", title: "CARTEL X RE:FLEX", size: "M", colour: "White", quantity: 1, costPrice: 262.5, rrp: 549.95, kind: "BINDINGS" });
    expect(r.lines[1]).toMatchObject({ title: "PHOTON BOA", rrp: 699.95, quantity: 1 });
    expect(r.costChanged).toHaveLength(1);
    expect(r.countChanged).toHaveLength(1);
    // The L was ordered and never invoiced: it did not arrive.
    expect(r.notArrived.map((l) => l.size)).toEqual(["L"]);
  });

  it("keeps an invoice line it cannot pair, and never guesses between two", () => {
    const r = mergeInvoiceWithOrder([line({ title: "CARTEL X RE:FLEX", quantity: 1, costPrice: 255 }), line({ title: "STEP ON GENESIS", quantity: 1 })], order);
    // Two sizes of the Cartel fit a line with no size: neither is guessed.
    expect(r.paired).toBe(0);
    expect(r.invoiceOnly).toHaveLength(2);
    expect(r.lines[0].costPrice).toBe(255);
  });

  it("tells the invoice from the order sheet by its name and kind", () => {
    const a = { filename: "Burton order confirmation.xlsx", lines: [] };
    const b = { filename: "INV-55123.pdf", lines: [] };
    expect(invoiceFirst(a, b)[0]).toBe(b);
    expect(invoiceFirst(b, a)[0]).toBe(b);
  });
});
