import { describe, expect, it } from "vitest";
import { buildDelivery, decideByName, lineKey, nameCandidates } from "./delivery";
import { reconcile, type InvoiceLine } from "./reconcile";

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine =>
  ({ sku: "", barcode: "", title: "", costPrice: null, rrp: null, quantity: null, ...over });

// Last year's listing, with barcodes the order does not carry.
const EXPORT = [
  "Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Barcodes,Variant Price,Variant Compare At Price,Variant Inventory Qty,SEO Title,Status",
  "blaze-94-2026,Blaze 94 2026,<p>A ski.</p>,Volkl,Snow Skis,2026,TRUE,Length,170,,'821264800133,1449.99,1449.99,4,Volkl Blaze 94 2026,active",
  "blaze-94-2026,,,,,,,Length,177,,'821264800140,1449.99,1449.99,2,,",
].join("\r\n") + "\r\n";
const ordered = [line({ title: "BLAZE 94", size: "170", quantity: 3, rrp: 1499.99 })];

describe("a line matched on its name, and what the person says about it", () => {
  it("is last year's listing by name, which the season's own matching passes over", () => {
    expect(reconcile(EXPORT, ordered, { season: "2027" }).matched).toEqual([]);
    const loose = reconcile(EXPORT, ordered, {});
    expect(loose.matched.map((m) => [m.key, m.handle])).toEqual([["name", "blaze-94-2026"]]);
    expect(nameCandidates(reconcile(EXPORT, ordered, { season: "2027" }), loose).map((c) => [c.match.handle, c.otherSeason])).toEqual([["blaze-94-2026", true]]);
    expect(nameCandidates(reconcile(EXPORT, ordered, { season: "2026" }), loose).map((c) => [c.match.handle, c.otherSeason])).toEqual([["blaze-94-2026", false]]);
  });

  it("is built as a new year's model when nothing is said, or when the person says so", () => {
    for (const decisions of [undefined, { [lineKey(ordered[0])]: "new" as const }]) {
      const out = buildDelivery(EXPORT, ordered, { season: "2027", vendor: "Volkl", decisions });
      expect(out.changes.filter((c) => c.column === "Variant Inventory Qty")).toEqual([]);
      expect(out.fresh[0]?.title).toBe("Blaze 94 2027");
      expect(out.carryOver).toEqual([]);
    }
  });

  it("has its stock put up on last year's listing when the person says it is the same product", () => {
    const out = buildDelivery(EXPORT, ordered, { season: "2027", vendor: "Volkl", decisions: { [lineKey(ordered[0])]: "same" } });
    const qty = out.changes.filter((c) => c.column === "Variant Inventory Qty");
    expect(qty.map((c) => [c.before, c.after])).toEqual([["4", "7"]]);
    expect(out.fresh).toEqual([]);
    expect(out.carryOver.map((m) => m.handle)).toEqual(["blaze-94-2026"]);
  });

  it("is left alone, and said so, when the person says it is not that product", () => {
    const out = buildDelivery(EXPORT, ordered, { season: "2027", vendor: "Volkl", decisions: { [lineKey(ordered[0])]: "skip" } });
    expect(out.changes).toEqual([]);
    expect(out.fresh).toEqual([]);
    expect(out.heldBack.map((h) => h.reason)).toEqual(["matched blaze-94-2026 on its name, and you said it is not that product"]);
  });

  it("stays a carry-over on this season's listing unless the person says otherwise", () => {
    const same = buildDelivery(EXPORT, ordered, { season: "2026", vendor: "Volkl" });
    expect(same.changes.filter((c) => c.column === "Variant Inventory Qty").map((c) => [c.before, c.after])).toEqual([["4", "7"]]);
    const skipped = buildDelivery(EXPORT, ordered, { season: "2026", vendor: "Volkl", decisions: { [lineKey(ordered[0])]: "skip" } });
    expect(skipped.changes).toEqual([]);
    expect(skipped.heldBack).toHaveLength(1);
  });

  it("keys a line by what the invoice gave, whatever case or spacing", () => {
    expect(lineKey(line({ title: " Blaze 94 ", size: "170" }))).toBe(lineKey(line({ title: "BLAZE 94", size: "170" })));
    expect(lineKey(line({ title: "Blaze 94", size: "170" }))).not.toBe(lineKey(line({ title: "Blaze 94", size: "177" })));
  });

  it("leaves a barcode match alone whatever is said", () => {
    const lines = [...ordered, line({ barcode: "821264800140", title: "BLAZE 94", size: "177", quantity: 1 })];
    const seasoned = reconcile(EXPORT, lines, { season: "2026" });
    const { reconciliation, skipped } = decideByName(seasoned, seasoned, () => "skip");
    expect(reconciliation.matched.map((m) => m.key)).toEqual(["barcode"]);
    expect(skipped).toHaveLength(1);
  });
});
