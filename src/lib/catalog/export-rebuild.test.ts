import { describe, it, expect } from "vitest";
import { generateCsvParts, type CsvProduct } from "./csv";

/**
 * A download rebuilds its CSV when the saved file is gone — the normal case on a deployment with
 * no blob storage, where the file was written to one instance's /tmp and the download is served
 * by another. Rebuilding is only safe if building twice gives back the same bytes.
 */
describe("rebuilding an exported CSV", () => {
  const ski: CsvProduct = {
    handle: "atomic-bent-90-2026",
    title: "Atomic Bent 90 2026",
    bodyHtml: "<p>All-mountain ski.</p>",
    vendor: "Atomic",
    productType: "Skis",
    tags: ["skis", "2026"],
    published: false,
    status: "draft",
    option1Name: "Length",
    images: [],
    variants: [{ sku: "", price: 1099.95, quantity: 2, option1Value: "172" }, { sku: "", price: 1099.95, quantity: 1, option1Value: "180" }],
  };
  const products: CsvProduct[] = [
    ski,
    { ...ski, handle: "atomic-bent-100-2026", title: "Atomic Bent 100 2026" },
    { ...ski, handle: "volkl-mantra-88-2026", title: "Volkl Mantra 88 2026", vendor: "Volkl" },
  ];

  it("produces identical bytes when run again on the same batch", () => {
    const once = generateCsvParts(products, { metafieldColumns: [] });
    const twice = generateCsvParts(products, { metafieldColumns: [] });
    expect(twice.map((p) => p.content)).toEqual(once.map((p) => p.content));
    expect(twice.map((p) => p.bytes)).toEqual(once.map((p) => p.bytes));
  });

  it("numbers the parts from one, so partIndex still names the same file", () => {
    const parts = generateCsvParts(products, { metafieldColumns: [] });
    expect(parts.map((p) => p.index)).toEqual(parts.map((_, i) => i + 1));
  });

  it("groups by brand in the same order twice, which is what partIndex counts through", () => {
    const split = () => {
      const groups = new Map<string, CsvProduct[]>();
      for (const p of products) {
        const key = p.vendor || "unbranded";
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      return [...groups].map(([group, list]) => [group, generateCsvParts(list, { metafieldColumns: [] }).map((part) => part.content)] as const);
    };
    const first = split();
    expect(split()).toEqual(first);
    // Two brands in, two files out — the thing a rebuilt partIndex indexes into.
    expect(first.map(([group]) => group)).toEqual(["Atomic", "Volkl"]);
  });
});
