import { readFileSync } from "node:fs";
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


/**
 * A download that does nothing is the worst kind of failure: identical from the outside whether
 * the file was missing, the batch changed, or the browser declined it. Every path now says which.
 */
describe("a failed download explains itself", () => {
  it("never reports a failure without a reason", async () => {
    const pipeline = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
    const body = pipeline.slice(pipeline.indexOf("export async function readExportFile"));
    const fn = body.slice(0, body.indexOf("\n}\n") + 3);
    // Every failure carries a reason, and nothing is swallowed into a bare null.
    expect(fn).not.toMatch(/return null/);
    for (const match of fn.matchAll(/ok: false[^}]*/g)) expect(match[0]).toContain("reason");
    // Both the stored read and the rebuild report what went wrong rather than discarding it.
    expect(fn).toContain("Could not read the saved file");
    expect(fn).not.toMatch(/\}\s*catch\s*\{\s*\}/);
  });

  it("is surfaced by the route rather than logged and forgotten", () => {
    const route = readFileSync(new URL("../../app/api/catalog/exports/[id]/route.ts", import.meta.url), "utf8");
    expect(route).toContain("file.reason");
    expect(route).toContain("console.error");
  });
});
