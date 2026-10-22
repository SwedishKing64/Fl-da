import { describe, expect, it } from "vitest";
import { toListings, toRecords, type StoreNode } from "./store-sync";

const node = (over: Partial<StoreNode> = {}): StoreNode => ({
  id: "gid://shopify/Product/1",
  handle: "atomic-bent-100-2027",
  title: "Atomic Bent 100 2027",
  vendor: "Atomic",
  productType: "Skis",
  tags: ["skis", " all-mountain ", ""],
  descriptionHtml: "<p>A ski.</p>",
  seo: { title: "Atomic Bent 100 2027 | Alpine", description: null },
  options: [{ name: "Length" }, { name: "Binding" }],
  collections: { nodes: [{ title: "Skis" }] },
  variants: { nodes: [
    { sku: "A1", barcode: "1234567890123", price: "799.00", compareAtPrice: "899.00", selectedOptions: [{ name: "Length", value: "172" }, { name: "Binding", value: "Marker Squire - Black" }] },
    { sku: "A2", barcode: "", price: "799.00", compareAtPrice: null, selectedOptions: [{ name: "Length", value: "180" }] },
  ] },
  ...over,
});

describe("toListings", () => {
  it("reads a listing the way the export gave it: compare-at as the price, the binding, every barcode", () => {
    expect(toListings([node()])).toEqual([{ handle: "atomic-bent-100-2027", title: "Atomic Bent 100 2027", vendor: "Atomic", productType: "Skis", tags: ["skis", "all-mountain"], price: 899, bindingOption: "Marker Squire - Black", barcodes: ["1234567890123"] }]);
  });
  it("falls back to the price when nothing is struck through", () => {
    const [l] = toListings([node({ variants: { nodes: [{ sku: "A", barcode: null, price: "49.95", compareAtPrice: null, selectedOptions: [] }] } })]);
    expect(l.price).toBe(49.95);
    expect(l.bindingOption).toBe("");
  });
});

describe("toRecords", () => {
  it("carries what the template analysis reads, leaving Shopify's placeholder option out", () => {
    const [r] = toRecords([node({ options: [{ name: "Title" }] })]);
    expect(r.optionNames).toEqual([]);
    expect(r.collections).toEqual(["Skis"]);
    expect(r.seoTitle).toBe("Atomic Bent 100 2027 | Alpine");
    expect(r.body).toBe("<p>A ski.</p>");
  });
});
