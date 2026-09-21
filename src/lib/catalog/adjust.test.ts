import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPlan, describeFile, isWholeFile, money, type Plan } from "./adjust";
import { parseCsv } from "./csv";

/**
 * Driven against the shop's own Shopify export — Karbon, Oakley and Quiksilver snow clothing, 140
 * products in 648 variant rows — because a file that a real export does not survive is no use.
 */
const EXPORT = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/a2c0583c-products_export-6.csv";
const text = readFileSync(EXPORT, "utf8");

function table(csv: string) {
  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0];
  const ix = (n: string) => header.indexOf(n);
  return { header, rows: grid.slice(1), ix };
}

describe("adjusting a real Shopify export", () => {
  it("reads what the file holds", () => {
    const d = describeFile(text);
    expect(d.products).toBe(140);
    expect(d.variantRows).toBe(648);
    expect(d.vendors).toEqual(["Karbon", "Oakley", "Quiksilver"]);
    expect(d.types).toContain("Snow Clothing");
  });

  it("changes only the cells the instruction names, and keeps every row and column", () => {
    const plan: Plan = { scope: { vendors: ["Karbon"] }, operations: [{ kind: "addTags", tags: ["clearance"] }] };
    const out = applyPlan(text, plan);
    const before = table(text), after = table(out.csv);
    expect(after.header).toEqual(before.header);
    expect(after.rows.length).toBe(before.rows.length);
    // Exactly the Tags cell of each Karbon product, and nothing else in the file.
    expect(out.matched).toBe(50);
    expect(out.changes).toHaveLength(50);
    expect(new Set(out.changes.map((c) => c.column))).toEqual(new Set(["Tags"]));
    let differing = 0;
    for (let r = 0; r < before.rows.length; r++) {
      for (let c = 0; c < before.header.length; c++) {
        if ((before.rows[r][c] ?? "") !== (after.rows[r][c] ?? "")) differing++;
      }
    }
    expect(differing).toBe(50);
  });

  it("discounts off the recommended retail in Compare At, which is how the shop does it", () => {
    // A product not yet on sale: today's price is the recommended retail and moves into Compare At.
    const plan: Plan = { scope: { vendors: ["Oakley"] }, operations: [{ kind: "discount", percent: 20 }] };
    const out = applyPlan(text, plan);
    const before = table(text), after = table(out.csv);
    const iP = after.ix("Variant Price"), iC = after.ix("Variant Compare At Price"), iH = after.ix("Handle");
    const oakley = new Set(out.changes.map((c) => c.handle));
    let checked = 0;
    for (let r = 0; r < after.rows.length; r++) {
      if (!oakley.has(after.rows[r][iH])) continue;
      const wasPrice = Number(before.rows[r][iP]), wasCompare = before.rows[r][iC].trim();
      if (!Number.isFinite(wasPrice) || before.rows[r][iP].trim() === "") continue;
      const rrp = wasCompare === "" ? wasPrice : Number(wasCompare);
      expect(Number(after.rows[r][iP])).toBeCloseTo(money(rrp * 0.8), 2);
      // The recommended retail is preserved, never overwritten by a second discount.
      expect(Number(after.rows[r][iC])).toBeCloseTo(rrp, 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("does not compound when a product is discounted twice", () => {
    const once = applyPlan(text, { scope: { vendors: ["Oakley"] }, operations: [{ kind: "discount", percent: 20 }] });
    const twice = applyPlan(once.csv, { scope: { vendors: ["Oakley"] }, operations: [{ kind: "discount", percent: 20 }] });
    // The second pass changes the price to the same figure, so nothing moves.
    expect(twice.changes).toHaveLength(0);
  });

  it("takes a product back off sale, to the recommended retail", () => {
    // Almost everything in this export is already marked down, so ending the sale means going back
    // to the figure in Compare At — the recommended retail — and clearing it.
    const off = applyPlan(text, { scope: { vendors: ["Karbon"] }, operations: [{ kind: "endSale" }] });
    const original = table(text), restored = table(off.csv);
    const iP = restored.ix("Variant Price"), iC = restored.ix("Variant Compare At Price"), iH = restored.ix("Handle");
    const touched = new Set(off.changes.map((c) => c.handle));
    let checked = 0;
    for (let r = 0; r < restored.rows.length; r++) {
      if (!touched.has(restored.rows[r][iH])) continue;
      const wasCompare = original.rows[r][iC].trim();
      if (wasCompare === "") continue;
      expect(Number(restored.rows[r][iP])).toBeCloseTo(Number(wasCompare), 2);
      expect(restored.rows[r][iC].trim()).toBe("");
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("writes a product's own columns once, on the row that carries them", () => {
    const out = applyPlan(text, { scope: { vendors: ["Quiksilver"] }, operations: [{ kind: "setStatus", status: "draft" }] });
    const after = table(out.csv);
    const iS = after.ix("Status"), iPub = after.ix("Published"), iH = after.ix("Handle");
    const before = table(text);
    const quiksilver = new Set<string>();
    for (let r = 0; r < before.rows.length; r++) {
      if (before.rows[r][before.ix("Vendor")] === "Quiksilver") quiksilver.add(before.rows[r][iH]);
    }
    expect(out.matched).toBe(40);
    const seen = new Set<string>();
    for (const row of after.rows) {
      const handle = row[iH];
      if (!quiksilver.has(handle)) continue;
      if (seen.has(handle)) {
        // A later row of the same product is untouched — Shopify reads these only on the first.
        expect(row[iS]).toBe("");
        continue;
      }
      seen.add(handle);
      expect(row[iS]).toBe("draft");
      expect(row[iPub]).toBe("false");
    }
    expect(seen.size).toBe(40);
    // 13 were already drafts, so only 27 status cells actually moved — a change list records what
    // changed, not what was asked for.
    expect(out.changes.filter((c) => c.column === "Status")).toHaveLength(27);
  });

  it("narrows by tag, and needs every tag named", () => {
    const one = applyPlan(text, { scope: { tags: ["snow jackets"] }, operations: [{ kind: "addTags", tags: ["x"] }] });
    const two = applyPlan(text, { scope: { tags: ["snow jackets", "mens"] }, operations: [{ kind: "addTags", tags: ["x"] }] });
    expect(one.matched).toBe(51);
    expect(two.matched).toBeLessThan(one.matched);
    expect(two.matched).toBeGreaterThan(0);
  });

  it("never invents a price for a row that has none", () => {
    const out = applyPlan(text, { scope: {}, operations: [{ kind: "discount", percent: 50 }] });
    const before = table(text), after = table(out.csv);
    const iP = after.ix("Variant Price");
    for (let r = 0; r < before.rows.length; r++) {
      if (before.rows[r][iP].trim() === "") expect(after.rows[r][iP].trim()).toBe("");
    }
  });

  it("says when a scope would take in the whole file", () => {
    expect(isWholeFile({})).toBe(true);
    expect(isWholeFile({ vendors: [] })).toBe(true);
    expect(isWholeFile({ vendors: ["Karbon"] })).toBe(false);
    expect(isWholeFile({ titleContains: "jacket" })).toBe(false);
  });

  it("refuses something that is not a product export, rather than mangling it", () => {
    const out = applyPlan("a,b\n1,2\n", { scope: {}, operations: [{ kind: "discount", percent: 10 }] });
    expect(out.changes).toHaveLength(0);
    expect(out.warnings[0]).toContain("Handle");
    expect(out.csv).toBe("a,b\n1,2\n");
  });

  /**
   * The first version of this used the generator's escapeCsvField, which straightens curly quotes.
   * Right when composing new copy; wrong here. Adding one tag to 50 products silently reworded the
   * apostrophe in all 50 descriptions — "snow pants’ recycled" became "snow pants' recycled" — so
   * a bulk price change would have quietly rewritten the catalogue's prose. A cell the instruction
   * did not name comes back exactly as it went in.
   */
  it("gives back every cell it was not asked about, byte for byte", () => {
    const out = applyPlan(text, { scope: { vendors: ["Karbon"] }, operations: [{ kind: "addTags", tags: ["clearance"] }] });
    const before = table(text), after = table(out.csv);
    const named = new Set(out.changes.map((c) => `${c.handle}|${c.column}`));
    const iH = before.ix("Handle");
    for (let r = 0; r < before.rows.length; r++) {
      for (let c = 0; c < before.header.length; c++) {
        if (named.has(`${before.rows[r][iH]}|${before.header[c]}`)) continue;
        expect(after.rows[r][c] ?? "", `row ${r} "${before.header[c]}"`).toBe(before.rows[r][c] ?? "");
      }
    }
    // Specifically the curly apostrophe that was being rewritten.
    const iBody = before.ix("Body (HTML)");
    const curly = before.rows.filter((row) => (row[iBody] ?? "").includes("\u2019"));
    expect(curly.length).toBeGreaterThan(0);
    expect(after.rows.filter((row) => (row[iBody] ?? "").includes("\u2019"))).toHaveLength(curly.length);
  });

  it("rounds to cents the way the catalogue does", () => {
    // 279.99 less 20% is 223.992, and the shop's own row reads 223.99.
    expect(money(279.99 * 0.8)).toBe(223.99);
    expect(money(229.99 * 0.85)).toBe(195.49);
    expect(money(1.005)).toBe(1.01);
  });
});
