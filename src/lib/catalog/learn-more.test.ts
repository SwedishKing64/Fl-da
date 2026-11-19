import { describe, expect, it } from "vitest";
import { exportRows, marginsFromRows, sampleBodies, seoPatternFromRows } from "./learn-more";

const HEADER = "Handle,Title,Body (HTML),Vendor,Type,Option1 Name,Option1 Value,Variant Price,Cost per item,SEO Title";
const row = (handle: string, title: string, vendor: string, type: string, price: number | "", cost: number | "", seo: string, body = "") =>
  [handle, title, `"${body}"`, vendor, type, "Size", "M", price, cost, `"${seo}"`].join(",");

describe("the rows of an export, one per product", () => {
  it("keeps the first row of each handle with its price, cost, SEO title and body", () => {
    const csv = [HEADER, row("a", "Mantra 88", "Völkl", "Skis", 1099, 600, "Völkl Mantra 88 | Alpine Edge", "<p>Hi</p>"), row("a", "", "", "", 1099, 600, "", ""), row("b", "Kore 93", "Head", "Skis", "", "", "")].join("\n");
    const rows = exportRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Mantra 88", vendor: "Völkl", productType: "Skis", price: 1099, cost: 600, seoTitle: "Völkl Mantra 88 | Alpine Edge", body: "<p>Hi</p>" });
    expect(rows[1]).toMatchObject({ title: "Kore 93", price: null, cost: null, seoTitle: "" });
  });
  it("is nothing without Handle and Title columns", () => {
    expect(exportRows("Name,Price\nx,1")).toEqual([]);
  });
});

describe("the shape of the SEO titles", () => {
  const rows = (seo: (t: string, v: string) => string, n = 10) => Array.from({ length: n }, (_, i) => ({ title: `Model ${i}`, vendor: i % 2 ? "Völkl" : "Head", productType: "Skis", seoTitle: seo(`Model ${i}`, i % 2 ? "Völkl" : "Head"), price: null, cost: null, body: "" }));
  it("finds the pattern most titles follow, in placeholders", () => {
    expect(seoPatternFromRows(rows((t, v) => `${v} ${t} | Alpine Edge`), "Alpine Edge")).toBe("{brand} {title} | {shop}");
    expect(seoPatternFromRows(rows((t) => `Buy ${t} online - Alpine Edge`), "Alpine Edge")).toBe("buy {title} online - {shop}");
  });
  it("is nothing where the titles do not agree, or where there are too few", () => {
    expect(seoPatternFromRows(rows((t, v) => (t.endsWith("1") || t.endsWith("3") || t.endsWith("5") || t.endsWith("7") ? `${v} ${t}` : `${t} online`)), "Alpine Edge")).toBe("");
    expect(seoPatternFromRows(rows((t) => `${t} | Alpine Edge`, 3), "Alpine Edge")).toBe("");
  });
  it("is nothing where the SEO title is not built from the title or brand", () => {
    expect(seoPatternFromRows(rows(() => "Great skis for sale"), "Alpine Edge")).toBe("");
  });
});

describe("each brand's margin", () => {
  const priced = (vendor: string, pairs: Array<[number, number]>) => pairs.map(([price, cost], i) => ({ title: `${vendor} ${i}`, vendor, productType: "Skis", seoTitle: "", price, cost, body: "" }));
  it("is the median where enough products agree, on the ex-tax price", () => {
    // $1100 inc 10% is $1000 ex; at $600 cost that is a 40% margin.
    const rows = priced("Völkl", [[1100, 600], [1100, 600], [1100, 600], [1100, 600], [1100, 600], [2200, 1300]]);
    expect(marginsFromRows(rows, 0.1, true)).toEqual([{ brand: "Völkl", marginPct: 40, products: 6 }]);
    expect(marginsFromRows(rows, 0.1, false)[0].marginPct).toBe(45);
  });
  it("leaves out a brand with few products, one that does not agree, and lines sold under cost", () => {
    const few = priced("Head", [[1000, 500], [1000, 500], [1000, 500], [1000, 500]]);
    const scattered = priced("Atomic", [[1000, 200], [1000, 500], [1000, 700], [1000, 300], [1000, 900], [1000, 100]]);
    const loss = priced("Nordica", [[500, 600], [500, 600], [500, 600], [500, 600], [500, 600]]);
    expect(marginsFromRows([...few, ...scattered, ...loss], 0, false)).toEqual([]);
  });
});

describe("a few descriptions to read the style off", () => {
  it("takes middling ones by length, not the shortest or the longest, and none that are tiny", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ title: "", vendor: "", productType: "", seoTitle: "", price: null, cost: null, body: i < 5 ? "short" : "x".repeat(200 + i * 100) }));
    const picked = sampleBodies(rows, 4);
    expect(picked).toHaveLength(4);
    for (const b of picked) expect(b.length).toBeGreaterThanOrEqual(200);
    expect(picked[0].length).toBeGreaterThan(200);
  });
  it("is nothing without usable bodies", () => {
    expect(sampleBodies([{ title: "", vendor: "", productType: "", seoTitle: "", price: null, cost: null, body: "" }])).toEqual([]);
  });
});
