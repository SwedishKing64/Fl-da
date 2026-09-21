import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPlan, describeFile, isWholeFile, money, verifyOnlyIntended, type Plan } from "./adjust";
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

/**
 * The promise this page makes, enforced at runtime rather than only in a test.
 *
 * A test proves it on the day it is written. This proves it on every file, against every change
 * anyone makes to this module afterwards — because the way a tool like this goes wrong is not a
 * visible error, it is a column nobody was watching coming back different across thousands of
 * rows, found weeks later in the live shop.
 */
describe("the guarantee that nothing else moves", () => {
  it("passes a clean edit through", () => {
    const out = applyPlan(text, { scope: { vendors: ["Karbon"] }, operations: [{ kind: "addTags", tags: ["clearance"] }] });
    expect(out.refused).toBeUndefined();
    expect(out.changes).toHaveLength(50);
    expect(verifyOnlyIntended(parseCsv(text).filter((r) => r.some((c) => c.trim() !== "")), out.csv, out.changes)).toEqual([]);
  });

  it("catches a cell that moved without being asked to", () => {
    const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    const header = grid[0];
    const iBody = header.indexOf("Body (HTML)");
    // Exactly the fault that shipped in the first version: a description quietly reworded.
    const tampered = grid.map((row, r) => (r === 5 ? row.map((c, i) => (i === iBody ? c.replace(/’/g, "'") + " " : c)) : row));
    const csv = tampered.map((row) => header.map((_, i) => {
      const v = row[i] ?? "";
      return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")).join("\r\n");
    const problems = verifyOnlyIntended(grid, csv, []);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain("Body (HTML)");
    expect(problems[0]).toContain("without being asked to");
  });

  it("notices a row going missing, and a header being rewritten", () => {
    const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    const header = grid[0].join(",");
    const body = grid.slice(1, -1).map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    expect(verifyOnlyIntended(grid, `${header}\r\n${body}`, [])[0]).toContain("rows instead of");
    const whole = grid.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    expect(verifyOnlyIntended(grid, whole.replace("Handle,", "Handel,"), [])[0]).toContain("header row");
  });

  it("does not mind a field being quoted differently, only a value changing", () => {
    const grid = parseCsv("Handle,Title\r\nabc,Plain\r\n").filter((r) => r.some((c) => c.trim() !== ""));
    // Same values, every field quoted. Nothing about the data moved.
    expect(verifyOnlyIntended(grid, '"Handle","Title"\r\n"abc","Plain"\r\n', [])).toEqual([]);
  });

  it("hands back the original file rather than one it cannot vouch for", () => {
    // Driven for real by reintroducing the old serialiser: 20 unintended cells, file returned
    // untouched, changes emptied. Here the contract is pinned so it cannot be quietly relaxed.
    const source = readFileSync(new URL("./adjust.ts", import.meta.url), "utf8");
    const fn = source.slice(source.indexOf("export function applyPlan"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("verifyOnlyIntended");
    expect(body).toMatch(/if \(unintended\.length > 0\)/);
    expect(body).toMatch(/csv: text/);      // the original, not the edited one
    expect(body).toMatch(/changes: \[\]/);  // and nothing claimed to have been done
    expect(body).toContain("refused: true");
    // The serialiser that caused it must never come back — as code. The comment explaining why it
    // is not used here is the point, so this looks at what is imported and called, not at prose.
    const code = source.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
    expect(code).not.toContain("escapeCsvField");
    expect(code).toMatch(/import \{ parseCsv \} from "\.\/csv"/);
  });
});

/**
 * The instruction that went wrong, against the export that catches it.
 *
 *   "For items with year tag '2999' or '2026' or '2025' or '2024' or '2998' add the 'clearance',
 *    and 'snow clearance' tag. Therefore items with a 2027 year tag should not be edited. If they
 *    are already added do not add again."
 *
 * Two things in that sentence the scope could not say. A list of five years is ANY ONE of them —
 * no product carries five years, so as an all-at-once match it finds nothing — and "2027 should
 * not be edited" is an exclusion. With neither expressible, the plan came back with an empty
 * scope, which means every product, and it went and tagged the 2027 skis.
 */
const WITH_2027 = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/8bacf3a9-products_export_1-3.csv";
const seasons = readFileSync(WITH_2027, "utf8");

describe("a list of years, and a year held back", () => {
  const YEARS = ["2999", "2026", "2025", "2024", "2998"];
  const plan: Plan = {
    scope: { anyTags: YEARS, excludeTags: ["2027"] },
    operations: [{ kind: "addTags", tags: ["clearance", "snow clearance"] }],
  };

  function tagsByHandle(csv: string) {
    const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
    const header = grid[0];
    const iH = header.indexOf("Handle"), iT = header.indexOf("Tags");
    const out = new Map<string, string[]>();
    for (const row of grid.slice(1)) {
      const h = row[iH];
      if (!h || out.has(h)) continue;
      out.set(h, (row[iT] ?? "").split(",").map((t) => t.trim()).filter(Boolean));
    }
    return out;
  }

  it("touches every product carrying any one of the years, and no others", () => {
    const before = tagsByHandle(seasons);
    const out = applyPlan(seasons, plan);
    const after = tagsByHandle(out.csv);

    let withYear = 0, with2027 = 0;
    for (const [handle, tags] of before) {
      const lower = tags.map((t) => t.toLowerCase());
      const hasYear = YEARS.some((y) => lower.includes(y));
      const has2027 = lower.includes("2027");
      const now = after.get(handle)!.map((t) => t.toLowerCase());
      if (has2027) {
        with2027++;
        // Held back, whatever else it carries — the exclusion wins.
        expect(now, handle).toEqual(lower);
      } else if (hasYear) {
        withYear++;
        expect(now, handle).toContain("clearance");
        expect(now, handle).toContain("snow clearance");
      } else {
        expect(now, handle).toEqual(lower);
      }
    }
    expect(with2027).toBe(17);
    expect(withYear).toBeGreaterThan(40);
    expect(out.matched).toBe(withYear);
  });

  it("does not add a tag a product already carries", () => {
    const once = applyPlan(seasons, plan);
    const twice = applyPlan(once.csv, plan);
    expect(twice.changes).toHaveLength(0);
  });

  it("a list of years as an all-at-once match is the bug, and finds nothing", () => {
    // Kept as the thing to never do: no product carries five years.
    const wrong = applyPlan(seasons, { scope: { tags: YEARS }, operations: [{ kind: "addTags", tags: ["clearance"] }] });
    expect(wrong.matched).toBe(0);
    expect(wrong.changes).toHaveLength(0);
  });

  it("an empty scope is the whole file, which is why it has to be said out loud", () => {
    expect(isWholeFile({ anyTags: ["2025"] })).toBe(false);
    expect(isWholeFile({ excludeTags: ["2027"] })).toBe(false);
    expect(isWholeFile({})).toBe(true);
  });
});

/**
 * "107 products match, 0 cells would change" is three different situations wearing one sentence.
 *
 * Nothing was understood as a change to make; nothing matched; or everything that matched is
 * already that way. Only the last of those is the tool working correctly, and reported as one
 * message there is no way to tell which you have. The page says which now; these pin the
 * behaviour underneath it.
 */
const FIFTY = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/f26cc03e-products_export-5.csv";
const mixed = readFileSync(FIFTY, "utf8");

describe("telling apart the reasons nothing changed", () => {
  const YEARS = ["2999", "2026", "2025", "2024", "2998"];
  const tagThem: Plan = {
    scope: { anyTags: YEARS, excludeTags: ["2027"] },
    operations: [{ kind: "addTags", tags: ["clearance", "snow clearance"] }],
  };

  it("really does change cells when the matching products lack the tags", () => {
    // 40 products in this file carry one of the years and none of them has both tags, so a run
    // that reports zero changes here would be a fault in applyPlan rather than a fact about data.
    const out = applyPlan(mixed, tagThem);
    expect(out.matched).toBe(40);
    expect(out.changes).toHaveLength(40);
    expect(new Set(out.changes.map((c) => c.column))).toEqual(new Set(["Tags"]));
    for (const c of out.changes) {
      expect(c.after.toLowerCase()).toContain("clearance");
      expect(c.after.toLowerCase()).toContain("snow clearance");
    }
  });

  it("matched but nothing to do, once they already carry it", () => {
    const once = applyPlan(mixed, tagThem);
    const twice = applyPlan(once.csv, tagThem);
    // The same products are found — so this is NOT "nothing matched" — and none of them moves.
    expect(twice.matched).toBe(40);
    expect(twice.changes).toHaveLength(0);
  });

  it("nothing matched is a different answer from nothing to do", () => {
    const out = applyPlan(mixed, { scope: { anyTags: ["1999"] }, operations: [{ kind: "addTags", tags: ["clearance"] }] });
    expect(out.matched).toBe(0);
    expect(out.changes).toHaveLength(0);
  });

  it("no operations at all is a third answer, and never reads as the products being fine", () => {
    const out = applyPlan(mixed, { scope: { anyTags: YEARS }, operations: [] });
    expect(out.matched).toBeGreaterThan(0);
    expect(out.changes).toHaveLength(0);
  });
});

/**
 * Several exports at once.
 *
 * The catalogue comes out of Shopify in pieces — a file per collection, or per search — and a
 * season's changes cut across them. One instruction is read once and applied to every file. A rule
 * about a brand that is not in a given file must find nothing there and leave it exactly alone,
 * which is the right answer rather than an error.
 */
describe("an instruction across several files", () => {
  const clothing = readFileSync(EXPORT, "utf8");   // Karbon / Oakley / Quiksilver
  const other = readFileSync(WITH_2027, "utf8");   // a different export entirely

  it("changes the file that has the brand and leaves the other untouched", () => {
    const plan: Plan = { scope: { vendors: ["Karbon"] }, operations: [{ kind: "addTags", tags: ["clearance"] }] };
    const a = applyPlan(clothing, plan);
    const b = applyPlan(other, plan);
    expect(a.matched).toBe(50);
    expect(a.changes.length).toBeGreaterThan(0);
    // Not an error, just nothing to do here.
    expect(b.matched).toBe(0);
    expect(b.changes).toHaveLength(0);
    expect(b.csv).toBe(applyPlan(other, { scope: { vendors: ["Karbon"] }, operations: [] }).csv);
    expect(b.warnings).toEqual([]);
  });

  it("totals across files the way the page reports them", () => {
    const plan: Plan = { scope: { anyTags: ["2025", "2026"] }, operations: [{ kind: "addTags", tags: ["snow sale"] }] };
    const results = [clothing, other].map((text) => applyPlan(text, plan));
    const matched = results.reduce((n, r) => n + r.matched, 0);
    const changes = results.reduce((n, r) => n + r.changes.length, 0);
    expect(matched).toBe(results[0].matched + results[1].matched);
    expect(matched).toBeGreaterThan(0);
    // Each file is independent: neither total is either file's alone.
    expect(results[0].matched).toBeGreaterThan(0);
    expect(results[1].matched).toBeGreaterThan(0);
    expect(changes).toBeGreaterThan(0);
  });

  it("keeps each file's own guarantee — nothing moves that was not asked for", () => {
    const plan: Plan = { scope: { anyTags: ["2025"] }, operations: [{ kind: "discount", percent: 10 }] };
    for (const text of [clothing, other]) {
      const out = applyPlan(text, plan);
      expect(out.refused).toBeUndefined();
      const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
      expect(verifyOnlyIntended(grid, out.csv, out.changes)).toEqual([]);
    }
  });
});
