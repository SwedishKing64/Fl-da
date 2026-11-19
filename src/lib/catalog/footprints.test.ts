import { describe, expect, it } from "vitest";
import { buildDelivery } from "./delivery";
import { parseCsv } from "./csv";
import { expandShorthand } from "./shorthand";
import { withoutVendor } from "./titles";
import type { InvoiceLine } from "./reconcile";

const line = (over: Partial<InvoiceLine>): InvoiceLine => ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...over });

// A Nemo tent the way the shop lists it: alone and with its footprint, both on the tent's barcode;
// the footprint as a product of its own.
const EXPORT = [
  "Handle,Title,Vendor,Type,Option1 Name,Option1 Value,Variant Barcode,Variant Price,Variant Inventory Qty,Status",
  "dagger-osmo-2p-tent,Dagger OSMO 2P Tent,NEMO,Tents,Option,Tent Only,'811666032706,899.95,0,active",
  "dagger-osmo-2p-tent,,,,Option,Tent + Footprint,'811666032706,999.95,0,",
  "dagger-2p-footprint,Dagger 2P Footprint,NEMO,Tent Accessories,Title,Default Title,'811666030603,99.95,0,active",
  "hornet-osmo-1p-tent,Hornet OSMO 1P Tent,NEMO,Tents,Footprint,No,'811666034052,699.95,2,active",
  "hornet-osmo-1p-tent,,,,,Yes,'811666034052,769.95,0,",
  "hornet-1p-footprint,Hornet 1P Footprint,NEMO,Tent Accessories,Title,Default Title,'814041014823,69.95,0,active",
].join("\r\n") + "\r\n";

const qtyOf = (csv: string, handle: string, option: string) => {
  const rows = parseCsv(csv);
  const h = rows[0];
  const row = rows.find((r) => r[0] === handle && r[h.indexOf("Option1 Value")] === option)!;
  return row[h.indexOf("Variant Inventory Qty")];
};

describe("tents and their footprints", () => {
  it("reads FP as a footprint, and a distributor's brand code off the front", () => {
    expect(expandShorthand("NEM Dagger 2P FP")).toBe("NEM Dagger 2P Footprint");
    expect(withoutVendor("Nemo", "NEM Dagger 2P Footprint")).toBe("Dagger 2P Footprint");
    expect(withoutVendor("Nemo", "Dagger 2P Footprint")).toBe("Dagger 2P Footprint");
  });

  it("puts an arriving tent on the tent alone, and the with-footprint variant only as far as there are footprints", () => {
    const out = buildDelivery(EXPORT, [
      line({ barcode: "811666032706", title: "NEM Dagger Osmo 2P Tent", quantity: 1 }),
    ], { vendor: "Nemo" });
    expect(out.reconciliation.ambiguous).toHaveLength(0);
    expect(qtyOf(out.csv, "dagger-osmo-2p-tent", "Tent Only")).toBe("1");
    // No Dagger 2P footprint in stock: the tent with its footprint stays at nothing.
    expect(qtyOf(out.csv, "dagger-osmo-2p-tent", "Tent + Footprint")).toBe("0");
  });

  it("with the footprint arriving too, both go up — never past the tent alone", () => {
    const out = buildDelivery(EXPORT, [
      line({ barcode: "811666032706", title: "NEM Dagger Osmo 2P Tent", quantity: 1 }),
      line({ barcode: "811666030603", title: "NEM Dagger 2P FP", quantity: 3 }),
    ], { vendor: "Nemo" });
    expect(qtyOf(out.csv, "dagger-2p-footprint", "Default Title")).toBe("3");
    expect(qtyOf(out.csv, "dagger-osmo-2p-tent", "Tent Only")).toBe("1");
    expect(qtyOf(out.csv, "dagger-osmo-2p-tent", "Tent + Footprint")).toBe("1");
  });

  it("a footprint arriving alone puts the tents it fits back in stock with it", () => {
    const out = buildDelivery(EXPORT, [line({ barcode: "814041014823", title: "NEM Hornet 1P FP", quantity: 1 })], { vendor: "Nemo" });
    expect(qtyOf(out.csv, "hornet-1p-footprint", "Default Title")).toBe("1");
    // Two tents alone, one footprint: one tent with its footprint.
    expect(qtyOf(out.csv, "hornet-osmo-1p-tent", "Yes")).toBe("1");
    expect(qtyOf(out.csv, "hornet-osmo-1p-tent", "No")).toBe("2");
  });
});

describe("a freight line on an invoice", () => {
  it("is a charge, not a product", async () => {
    const { withoutCharges } = await import("./invoice-merge");
    const doc = withoutCharges({ lines: [line({ barcode: "811666030603", title: "NEM Dagger 2P FP", quantity: 1 }), line({ title: "Freight Charge", quantity: 1, costPrice: 22.47 })] });
    expect(doc.lines.map((l) => l.title)).toEqual(["NEM Dagger 2P FP"]);
  });
});
