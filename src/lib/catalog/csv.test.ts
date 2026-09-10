import { describe, expect, it } from "vitest";
import {
  buildRows,
  columnsFor,
  escapeCsvField,
  generateCsv,
  generateCsvParts,
  isPublicHttpsUrl,
  parseCsv,
  validateCsvFile,
  validateProducts,
  type CsvProduct,
} from "./csv";
import { buildHandle, isValidHandle, slugify } from "./handle";

const skis: CsvProduct = {
  handle: "atomic-bent-90-2026",
  title: "Atomic Bent 90 2026",
  bodyHtml: "<p>All-mountain freestyle ski, “playful” and light.</p>",
  vendor: "Atomic",
  productType: "Skis",
  tags: ["skis", "all-mountain", "2026"],
  published: false,
  status: "draft",
  seoTitle: "Atomic Bent 90 2026 Skis | Sydney Ski Shop",
  seoDescription: "Atomic Bent 90 skis, 2026 model.",
  option1Name: "Length",
  option2Name: "Colour",
  collection: "Skis",
  metafields: { "Flex (product.metafields.ski.flex)": "Medium" },
  images: [
    { url: "https://cdn.example.com/bent90-1.jpg", altText: "Atomic Bent 90" },
    { url: "https://cdn.example.com/bent90-2.jpg" },
    { url: "https://cdn.example.com/bent90-3.jpg" },
  ],
  variants: [
    { sku: "AA0029-166", barcode: "887445290001", option1Value: "166", option2Value: "Blue", grams: 3200, quantity: 2, price: 899.99, compareAtPrice: 999, costPerItem: 450 },
    { sku: "AA0029-172", option1Value: "172", option2Value: "Blue", grams: 3300, quantity: 3, price: 899.99, compareAtPrice: 850 },
  ],
};

const beanie: CsvProduct = {
  handle: "acme-beanie",
  title: "Acme Beanie, Black",
  vendor: "Acme",
  productType: "Accessories",
  images: [],
  variants: [{ sku: "ACME-BEANIE", price: 29.99, quantity: 10 }],
};

describe("row-per-variant model", () => {
  const rows = buildRows([skis, beanie]);

  it("puts shared fields only on the first row of a handle", () => {
    expect(rows).toHaveLength(4); // 2 variants + 1 overflow image + 1 beanie
    expect(rows[0].Title).toBe("Atomic Bent 90 2026");
    expect(rows[0].Vendor).toBe("Atomic");
    expect(rows[0].Tags).toBe("skis, all-mountain, 2026");
    expect(rows[0].Published).toBe("FALSE");
    expect(rows[0].Status).toBe("draft");
    expect(rows[0].Collection).toBe("Skis");
    expect(rows[0]["Flex (product.metafields.ski.flex)"]).toBe("Medium");
    expect(rows[1].Handle).toBe("atomic-bent-90-2026");
    expect(rows[1].Title).toBeUndefined();
    expect(rows[1].Vendor).toBeUndefined();
    expect(rows[1].Tags).toBeUndefined();
    expect(rows[1]["Body (HTML)"]).toBeUndefined();
  });

  it("writes options, variant columns and images in position order", () => {
    expect(rows[0]["Option1 Name"]).toBe("Length");
    expect(rows[0]["Option1 Value"]).toBe("166");
    expect(rows[0]["Option2 Value"]).toBe("Blue");
    expect(rows[0]["Variant Price"]).toBe("899.99");
    expect(rows[0]["Variant Compare At Price"]).toBe("999.00");
    expect(rows[1]["Variant Compare At Price"]).toBe(""); // compare-at below price is dropped
    expect(rows[0]["Cost per item"]).toBe("450.00");
    expect(rows[0]["Variant Inventory Tracker"]).toBe("shopify");
    expect(rows[0]["Variant Inventory Policy"]).toBe("deny");
    expect(rows[0]["Variant Fulfillment Service"]).toBe("manual");
    expect(rows[0]["Variant Grams"]).toBe("3200");
    expect(rows[0]["Variant Barcode"]).toBe("887445290001");
    expect(rows[0]["Image Src"]).toBe("https://cdn.example.com/bent90-1.jpg");
    expect(rows[0]["Image Position"]).toBe("1");
    expect(rows[1]["Image Src"]).toBe("https://cdn.example.com/bent90-2.jpg");
    expect(rows[1]["Image Position"]).toBe("2");
    // overflow image row: handle + image only
    expect(rows[2]).toEqual({ Handle: "atomic-bent-90-2026", "Image Src": "https://cdn.example.com/bent90-3.jpg", "Image Position": "3", "Image Alt Text": "" });
  });

  it("uses Title / Default Title for products without options", () => {
    expect(rows[3]["Option1 Name"]).toBe("Title");
    expect(rows[3]["Option1 Value"]).toBe("Default Title");
    expect(rows[3]["Option2 Name"]).toBeUndefined();
  });
});

describe("serialisation", () => {
  it("quotes commas/quotes/newlines and straightens curly quotes", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a, b")).toBe('"a, b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("“quoted”")).toBe('"""quoted"""');
    expect(escapeCsvField("line1\r\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField(12.5)).toBe("12.5");
    expect(escapeCsvField(null)).toBe("");
  });

  it("produces a header with all core columns, the Collection column and metafields", () => {
    const csv = generateCsv([skis, beanie], { metafieldColumns: ["Flex (product.metafields.ski.flex)"] });
    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual(columnsFor({ metafieldColumns: ["Flex (product.metafields.ski.flex)"] }));
    expect(parsed[0]).toContain("Handle");
    expect(parsed[0]).toContain("Body (HTML)");
    expect(parsed[0]).toContain("Variant Inventory Qty");
    expect(parsed[0]).toContain("SEO Description");
    expect(parsed[0]).toContain("Collection");
    expect(parsed[0]).toContain("Status");
    expect(parsed[0][parsed[0].length - 1]).toBe("Flex (product.metafields.ski.flex)");
    expect(parsed).toHaveLength(5);
    expect(parsed[1][0]).toBe("atomic-bent-90-2026");
    expect(parsed[1][2]).toBe('<p>All-mountain freestyle ski, "playful" and light.</p>');
    expect(parsed[4][1]).toBe("Acme Beanie, Black");
    expect(csv).not.toMatch(/[“”‘’]/);
    expect(csv.includes("\r")).toBe(false);
  });

  it("round-trips through the file validator with no issues", () => {
    const csv = generateCsv([skis, beanie], { metafieldColumns: ["Flex (product.metafields.ski.flex)"] });
    expect(validateCsvFile(csv)).toEqual([]);
  });
});

describe("validation", () => {
  it("flags duplicate handles, duplicate option combos, bad prices, bad image URLs", () => {
    const bad: CsvProduct[] = [
      { ...skis, variants: [skis.variants[0], { ...skis.variants[1], option1Value: "166" }] },
      { ...skis, title: "Different title" },
      { ...beanie, handle: "Bad Handle!", images: [{ url: "http://insecure.example.com/x.jpg" }], variants: [{ sku: "ACME-BEANIE", price: NaN }] },
    ];
    const msgs = validateProducts(bad).map((i) => i.message);
    expect(msgs).toContainEqual(expect.stringContaining("Duplicate option combination"));
    expect(msgs).toContainEqual(expect.stringContaining("Duplicate handle"));
    expect(msgs).toContainEqual(expect.stringContaining("conflicting product fields"));
    expect(msgs).toContainEqual(expect.stringContaining("Invalid handle"));
    expect(msgs).toContainEqual(expect.stringContaining("no valid price"));
    expect(msgs).toContainEqual(expect.stringContaining("not a public HTTPS URL"));
    expect(msgs).toContainEqual(expect.stringContaining("SKU AA0029-166 appears twice"));
  });

  it("flags missing option values and SKUs shared across handles", () => {
    const msgs = validateProducts([
      { ...skis, variants: [{ sku: "X1", option1Value: "", option2Value: "Blue", price: 1 }] },
      { ...beanie, variants: [{ sku: "x1", price: 5 }] },
    ]).map((i) => i.message);
    expect(msgs).toContainEqual(expect.stringContaining("missing a value for Length"));
    expect(msgs).toContainEqual(expect.stringContaining("also used by"));
  });

  it("warns (not errors) for products with no images", () => {
    const issues = validateProducts([beanie]);
    expect(issues).toEqual([{ level: "warning", handle: "acme-beanie", message: "No images" }]);
  });

  it("file validator catches inconsistent option names, non-contiguous handles, curly quotes", () => {
    const header = columnsFor().join(",");
    const line = (h: string, title: string, o1: string, o1v: string, price: string) =>
      [h, title, "", "", "", "", "FALSE", o1, o1v, "", "", "", "", "", "0", "shopify", "0", "deny", "manual", price, "", "TRUE", "TRUE", "", "", "", "", "FALSE", "", "", "", "g", "", "", "draft"].join(",");
    const csv = [header, line("a", "A", "Length", "160", "10.00"), line("b", "B", "Size", "M", "5.00"), line("a", "", "Size", "170", "10.00"), line("a", "", "Length", "170", "$10")].join("\n");
    const msgs = validateCsvFile(csv + "\n“hi”").map((i) => i.message);
    expect(msgs).toContainEqual(expect.stringContaining("not contiguous"));
    expect(msgs).toContainEqual(expect.stringContaining("Inconsistent option names"));
    expect(msgs).toContainEqual(expect.stringContaining("not a plain decimal"));
    expect(msgs).toContainEqual(expect.stringContaining("curly quotes"));
    expect(msgs).toContainEqual(expect.stringContaining("Duplicate option values"));
  });

  it("only accepts public https image URLs", () => {
    expect(isPublicHttpsUrl("https://cdn.shopify.com/a.jpg")).toBe(true);
    expect(isPublicHttpsUrl("http://cdn.shopify.com/a.jpg")).toBe(false);
    expect(isPublicHttpsUrl("https://localhost/a.jpg")).toBe(false);
    expect(isPublicHttpsUrl("https://192.168.1.4/a.jpg")).toBe(false);
    expect(isPublicHttpsUrl("not a url")).toBe(false);
  });
});

describe("splitting", () => {
  it("splits into multiple files without splitting a handle, each with a header", () => {
    const products: CsvProduct[] = Array.from({ length: 30 }, (_, i) => ({
      ...skis,
      handle: `ski-${i}`,
      variants: skis.variants.map((v) => ({ ...v, sku: `${v.sku}-${i}` })),
    }));
    const single = generateCsv(products);
    const parts = generateCsvParts(products, { maxBytes: Math.ceil(Buffer.byteLength(single) / 4) });
    expect(parts.length).toBeGreaterThanOrEqual(4);
    const header = columnsFor().join(",");
    const allHandles: string[] = [];
    for (const part of parts) {
      expect(part.content.startsWith(header + "\n")).toBe(true);
      expect(part.bytes).toBeLessThanOrEqual(Math.ceil(Buffer.byteLength(single) / 4) + 1500); // one product may overflow a tight limit
      expect(validateCsvFile(part.content)).toEqual([]);
      const handlesInPart = new Set(parseCsv(part.content).slice(1).map((r) => r[0]));
      for (const h of handlesInPart) expect(allHandles).not.toContain(h);
      allHandles.push(...part.handles);
    }
    expect(allHandles).toHaveLength(30);
    expect(parts.reduce((s, p) => s + p.rowCount, 0)).toBe(30 * 3);
  });

  it("respects a max row count", () => {
    const products: CsvProduct[] = Array.from({ length: 10 }, (_, i) => ({ ...beanie, handle: `b-${i}`, variants: [{ sku: `B${i}`, price: 1 }] }));
    const parts = generateCsvParts(products, { maxRows: 4 });
    expect(parts.map((p) => p.rowCount)).toEqual([4, 4, 2]);
  });
});

describe("handles", () => {
  it("slugifies to url-safe lowercase hyphenated form", () => {
    expect(slugify("Völkl M6 Mantra 2026 (177cm)")).toBe("volkl-m6-mantra-2026-177cm");
    expect(slugify("  Black & White / Red  ")).toBe("black-and-white-red");
    expect(slugify("Rossignol Experience 88 Ti’s")).toBe("rossignol-experience-88-ti-s");
    expect(isValidHandle("volkl-m6-mantra")).toBe(true);
    expect(isValidHandle("Volkl M6")).toBe(false);
    expect(isValidHandle("-leading")).toBe(false);
  });

  it("is deterministic and avoids doubling the brand", () => {
    expect(buildHandle({ brand: "Atomic", title: "Atomic Bent 90" })).toBe("atomic-bent-90");
    expect(buildHandle({ brand: "Atomic", title: "Bent 90" })).toBe("atomic-bent-90");
    expect(buildHandle({ brand: "", title: "Bent 90" })).toBe("bent-90");
  });
});
