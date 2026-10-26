import { describe, expect, it } from "vitest";
import { applyPlan, foldPlans, type Plan } from "./adjust";
import { parseCsv } from "./csv";

/**
 * A big export handled quickly must give exactly what the slow way gave (2026-10-26: a 2,500-product
 * export froze the page; the reader, the cache of read files and the preview mode were made faster).
 */
const HEAD = "Handle,Title,Vendor,Type,Tags,Option1 Name,Option1 Value,Variant Price,Variant Compare At Price,Body (HTML)";
function bigExport(products: number): string {
  const rows = [HEAD];
  for (let p = 0; p < products; p++) {
    const tags = p % 3 === 0 ? "ski-gloves, 2026" : p % 3 === 1 ? "headwear, 2999" : "socks, 2025";
    rows.push(`item-${p},"Item ${p}, ""quoted""",Brand,Ski Accessories,"${tags}",Size,S,${100 + (p % 50)}.00,,"<p>Line one\nline two</p>"`);
    rows.push(`item-${p},,,,,,M,${100 + (p % 50)}.00,,`);
  }
  return rows.join("\r\n") + "\r\n";
}

describe("a large export", () => {
  const csv = bigExport(3000);
  const gloves: Plan = { scope: { tags: ["ski-gloves", "2026"] }, operations: [{ kind: "discount", percent: 10 }] };
  const hats: Plan = { scope: { tags: ["headwear"] }, operations: [{ kind: "discount", percent: 20 }] };

  it("previews the same changes it applies, without writing the file", () => {
    const full = applyPlan(csv, gloves);
    const preview = applyPlan(csv, gloves, { preview: true });
    expect(preview.changes).toEqual(full.changes);
    expect(preview.csv).toBe(csv);
    expect(full.changes.length).toBe(4000);
  });

  it("applies one change after another to the same result as applying them together", () => {
    const together = foldPlans([{ name: "a", csv }], [{ id: 1, plan: gloves, label: "g" }, { id: 2, plan: hats, label: "h" }]);
    const first = foldPlans([{ name: "a", csv }], [{ id: 1, plan: gloves, label: "g" }]);
    const second = foldPlans([{ name: "a", csv: first.files[0].csv }], [{ id: 2, plan: hats, label: "h" }]);
    expect(second.files[0].csv).toBe(together.files[0].csv);
    expect(together.refused).toEqual([]);
    // Only prices moved: every description, quote and line break came back as it was.
    const before = parseCsv(csv), after = parseCsv(together.files[0].csv);
    expect(after.map((r) => r[9])).toEqual(before.map((r) => r[9]));
    expect(after.map((r) => r[1])).toEqual(before.map((r) => r[1]));
  });

  it("is quick enough not to freeze the page", () => {
    const t = performance.now();
    for (let k = 0; k < 5; k++) applyPlan(csv, { scope: { tags: ["socks"] }, operations: [{ kind: "discount", percent: 5 + k }] });
    expect((performance.now() - t) / 5).toBeLessThan(1500);
  });
});
