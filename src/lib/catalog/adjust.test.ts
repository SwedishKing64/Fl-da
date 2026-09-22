import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPlan, describeFile, foldPlans, isWholeFile, money, renamedTitle, titleWithYear, verifyOnlyIntended, whyNoMatch, type FoldStep, type Plan } from "./adjust";
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

/**
 * The vocabulary an instruction is grounded in.
 *
 * Everything on the bulk page hangs off this list: a category the file does not appear to have is
 * refused rather than silently widened, so a shelf tag missing from here is a row that cannot run.
 * Shopify's own colour, size and length tags are nearly half of what a multi-file load carries,
 * and in alphabetical order they sit right where the shelf tags do.
 */
describe("what an instruction is grounded in", () => {
  const DIR = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3";

  it("leaves out the tags Shopify writes for itself", () => {
    const { tags } = describeFile(text);
    expect(tags.length).toBeGreaterThan(20);
    expect(tags.filter((t) => /^(colou?r|size|length)-/i.test(t))).toEqual([]);
    expect(tags.filter((t) => /^\d+-\d+$/.test(t) || /^under-\d+$/.test(t))).toEqual([]);
  });

  it("keeps the shelf tags a clearance sheet names", () => {
    const { tags, types } = describeFile(text);
    const has = (name: string) => tags.some((t) => t.toLowerCase() === name) || types.some((t) => t.toLowerCase() === name);
    // Every one of these is a category column in the buyer's October sheet.
    for (const shelf of ["goggles", "gloves", "ski-helmets", "midlayers", "snow clothing"]) {
      expect(has(shelf), `${shelf} must survive into the grounding vocabulary`).toBe(true);
    }
    expect(tags).toContain("snow clearance");
    expect(tags).toContain("clearance");
  });

  it("keeps them even when every export is loaded at once", () => {
    // The real complaint: several exports open together. Before the generated tags were dropped,
    // the merged list ran to 399 and the shelf tags all sat past where the prompt was truncated.
    const files = readdirSync(DIR).filter((f) => f.endsWith(".csv")).sort();
    expect(files.length).toBeGreaterThan(5);
    const merged = new Set<string>();
    for (const f of files) for (const t of describeFile(readFileSync(`${DIR}/${f}`, "utf8")).tags) merged.add(t);
    const tags = [...merged].sort((a, b) => a.localeCompare(b));

    expect(tags.filter((t) => /^(colou?r|size|length)-/i.test(t))).toEqual([]);
    // Everything the sheet scopes by has to be inside the 400 the prompt carries.
    for (const shelf of ["goggles", "gloves", "ski-helmets", "snowboard-bindings", "midlayers", "ski poles", "snow clearance"]) {
      const at = tags.findIndex((t) => t.toLowerCase() === shelf);
      expect(at, `${shelf} is missing from the merged vocabulary`).toBeGreaterThanOrEqual(0);
      expect(at, `${shelf} falls outside the 400 tags the prompt carries`).toBeLessThan(400);
    }
  });
});

/**
 * A file that has been through a spreadsheet program on the way here.
 *
 * Driven against the real one: a goggles export this tool produced, opened in a spreadsheet and
 * exported back, arrived with its own filename written above the header. Shopify reads that line
 * as the column names, finds no Handle, and refuses all 500 rows.
 */
describe("an export with a line above the header", () => {
  const REAL = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/b321f48f-Goggles_Updated.csv";

  it("is the shape the real file arrived in", () => {
    const raw = readFileSync(REAL, "utf8");
    expect(raw.startsWith("products_export_1 (4)-updated\r\nHandle,Title,")).toBe(true);
  });

  it("reads the products under it instead of seeing an empty file", () => {
    const f = describeFile(readFileSync(REAL, "utf8"));
    expect(f.products).toBe(165);
    expect(f.variantRows).toBe(500);
    expect(f.tags).toContain("clearance");
  });

  it("still finds nothing in a file that genuinely is not an export", () => {
    expect(describeFile("some notes\nand more notes\n").products).toBe(0);
  });

  it("takes the line out, says so, and hands back something Shopify will read", () => {
    const out = applyPlan(readFileSync(REAL, "utf8"), { scope: { types: ["Ski Accessories"] }, operations: [{ kind: "addTags", tags: ["test-tag"] }] });
    expect(out.refused).toBeUndefined();
    expect(out.csv.startsWith("Handle,Title,")).toBe(true);
    expect(out.warnings.some((w) => w.includes("above the column headings") && w.includes("products_export_1 (4)-updated"))).toBe(true);
    expect(out.changes.length).toBeGreaterThan(0);
  });

  it("leaves a file that already starts with its header exactly as it was", () => {
    const out = applyPlan(text, { scope: { vendors: ["Karbon"] }, operations: [{ kind: "addTags", tags: ["test-tag"] }] });
    expect(out.warnings.some((w) => w.includes("above the column headings"))).toBe(false);
  });
});

/**
 * A group of changes applied as one step.
 *
 * The failure this guards against has no error message: the changes look applied on screen, and
 * the file that comes down the wire is the one that went up. So it is asserted on the bytes.
 */
describe("applying several plans as one step", () => {
  const tagStep = (id: number, vendor: string, tag: string): FoldStep =>
    ({ id, label: `${vendor} → ${tag}`, plan: { scope: { vendors: [vendor] }, operations: [{ kind: "addTags", tags: [tag] }] } });

  it("hands back a file that really is different from the one it went in as", () => {
    const out = foldPlans([{ name: "a.csv", csv: text }], [tagStep(1, "Karbon", "step-one")]);
    expect(out.applied).toEqual([1]);
    expect(out.changes).toBeGreaterThan(0);
    expect(out.files[0].csv).not.toBe(text);
    expect(out.files[0].csv).toContain("step-one");
    expect(out.files[0].changes).toBe(out.changes);
  });

  it("carries each step onto the result of the one before it", () => {
    const out = foldPlans([{ name: "a.csv", csv: text }], [tagStep(1, "Karbon", "step-one"), tagStep(2, "Karbon", "step-two")]);
    expect(out.applied).toEqual([1, 2]);
    // Both tags on the same products: the second step read the first step's file, not the original.
    const both = parseCsv(out.files[0].csv).filter((r) => r.some((c) => c.trim() !== ""));
    const tagsAt = both[0].indexOf("Tags");
    const rows = both.slice(1).filter((r) => (r[tagsAt] ?? "").includes("step-one"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r[tagsAt].includes("step-two"))).toBe(true);
  });

  it("leaves a file alone when no step matches anything in it", () => {
    const out = foldPlans([{ name: "a.csv", csv: text }], [tagStep(1, "Nobody At All", "nope")]);
    expect(out.files[0].csv).toBe(text);
    expect(out.files[0].changes).toBe(0);
  });

  it("counts the changes per file, so the page can say which files to download", () => {
    const out = foldPlans([{ name: "a.csv", csv: text }, { name: "b.csv", csv: "Handle,Title\r\nx,Y\r\n" }], [tagStep(1, "Karbon", "only-in-a")]);
    expect(out.files[0].changes).toBeGreaterThan(0);
    expect(out.files[1].changes).toBe(0);
    expect(out.files[1].csv).toBe("Handle,Title\r\nx,Y\r\n");
  });

  it("reports nothing applied when every step is a no-op, rather than a changed file", () => {
    const out = foldPlans([{ name: "a.csv", csv: text }], [tagStep(1, "Nobody At All", "nope")]);
    expect(out.changes).toBe(0);
    expect(out.applied).toEqual([1]);
  });
});

/**
 * The bytes that go in the file, not just the name on it.
 *
 * A download named .csv that is not readable as a CSV is the same failure with a better disguise.
 */
describe("what comes out is a CSV", () => {
  const out = applyPlan(text, { scope: { vendors: ["Karbon"] }, operations: [{ kind: "addTags", tags: ["shape-check"] }] });

  it("parses back with the same header and the same number of rows", () => {
    const before = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim() !== ""));
    expect(after.length).toBe(before.length);
    expect(after[0]).toEqual(before[0]);
  });

  it("gives every row the same number of columns as the header", () => {
    const after = parseCsv(out.csv).filter((r) => r.some((c) => c.trim() !== ""));
    expect(after.every((r) => r.length === after[0].length)).toBe(true);
  });

  it("ends with a newline and uses CRLF, as Shopify's own exports do", () => {
    expect(out.csv.endsWith("\r\n")).toBe(true);
    expect(out.csv.split("\r\n").length - 1).toBeGreaterThan(100);
  });

  it("carries no byte-order mark, because the file it came from had none", () => {
    expect(out.csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("quotes a field holding a comma or a quote, so it reads back as one field", () => {
    const tricky = 'Handle,Title,Tags\r\nx,"Jacket, mens","a,b"\r\n';
    const r = applyPlan(tricky, { scope: {}, operations: [{ kind: "addTags", tags: ["c"] }] });
    const rows = parseCsv(r.csv).filter((row) => row.some((c) => c.trim() !== ""));
    expect(rows[1][1]).toBe("Jacket, mens");
    // The tag list is rebuilt with one space after each comma. That is inside the cell the change
    // was asked to make; every other cell still has to come back byte for byte, which is what
    // verifyOnlyIntended proves on every file.
    expect(rows[1][2]).toBe("a, b, c");
  });
});


/**
 * Editing what a product is called, and how many of it there are.
 *
 * The buyer asked for these alongside price: a season reorder changes the year in the title, the
 * invoice says how many came in. Both are read off the shop's own export rather than assumed.
 */
const SKIS = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/48bf1557-products_export_1_5.csv";
const skis = readFileSync(SKIS, "utf8");

describe("putting a season in the title", () => {
  it("replaces the year a title already carries, and leaves the rest of the wording alone", () => {
    expect(titleWithYear("Mindbender 88 2027 inc Marker Griffon Demo Binding Package EX DEMO", "2028"))
      .toBe("Mindbender 88 2028 inc Marker Griffon Demo Binding Package EX DEMO");
    expect(titleWithYear("Rustler 10 2025", "2026")).toBe("Rustler 10 2026");
  });

  it("puts a new year in front of the length and the binding wording, not on the end", () => {
    // The thing appending would have got wrong, on 252 of their products.
    expect(titleWithYear("Wingman 78 Ti inc EL 10.0 Shift Binding Package", "2027"))
      .toBe("Wingman 78 Ti 2027 inc EL 10.0 Shift Binding Package");
    expect(titleWithYear("Mr J 140cm inc Marker M7.0 Binding Package", "2027"))
      .toBe("Mr J 2027 140cm inc Marker M7.0 Binding Package");
    expect(titleWithYear("Blacklight 95 inc Binding Crampon and Skins Package", "2027"))
      .toBe("Blacklight 95 2027 inc Binding Crampon and Skins Package");
  });

  it("appends only when the title has no tail to sit in front of", () => {
    expect(titleWithYear("Vertis Birdie", "2027")).toBe("Vertis Birdie 2027");
  });

  it("leaves the title alone when the year is not a year", () => {
    expect(titleWithYear("Rustler 10", "next season")).toBe("Rustler 10");
    expect(titleWithYear("Rustler 10", "26")).toBe("Rustler 10");
  });

  it("rebuilds their own titles: strip the year out and put it back", () => {
    // The measurement the rule is built on, kept as a test so it cannot quietly rot: every title
    // in their ski export that names a season, with the season removed and reinserted.
    const { rows, ix } = table(skis);
    const iT = ix("Title");
    const titles = [...new Set(rows.map((r) => (r[iT] ?? "").trim()).filter((t) => /\b20\d\d\b/.test(t)))];
    expect(titles.length).toBeGreaterThan(200);
    const rebuilt = titles.filter((t) => {
      const year = t.match(/\b20\d\d\b/)![0];
      const stripped = t.replace(/\s*\b20\d\d\b\s*/, " ").replace(/\s{2,}/g, " ").trim();
      return titleWithYear(stripped, year) === t;
    });
    expect(rebuilt.length / titles.length).toBeGreaterThan(0.95);
  });

  it("writes the title once per product and says the URL has not moved", () => {
    const plan: Plan = { scope: { vendors: ["Volkl"] }, operations: [{ kind: "setTitleYear", year: "2028" }] };
    const out = applyPlan(skis, plan);
    expect(out.refused).toBeUndefined();
    expect(out.matched).toBe(70);
    // 70 Volkl products, 70 title cells — never one per variant row, of which they have far more.
    expect(out.changes).toHaveLength(70);
    expect(new Set(out.changes.map((c) => c.column))).toEqual(new Set(["Title"]));
    expect(out.changes.every((c) => c.after.includes("2028"))).toBe(true);
    expect(out.changes.some((c) => c.before.includes("2026"))).toBe(true);
    expect(out.warnings.join(" ")).toContain("matches an import on Handle");

    // And the handles themselves are untouched, which is the whole point of that warning.
    const before = table(skis), after = table(out.csv);
    const iH = after.ix("Handle");
    expect(after.rows.map((r) => r[iH])).toEqual(before.rows.map((r) => r[iH]));
  });
});

describe("renaming and restocking", () => {
  it("swaps wording in the title wherever it appears, however it is capitalised", () => {
    expect(renamedTitle("Mindbender 88 inc Marker Griffon Demo Binding Package", "griffon demo", "Griffon 13"))
      .toBe("Mindbender 88 inc Marker Griffon 13 Binding Package");
    expect(renamedTitle("Rustler 10 EX DEMO", " EX DEMO", "")).toBe("Rustler 10");
    expect(renamedTitle("Rustler 10", "", "x")).toBe("Rustler 10");
    // A replacement is wording, not a pattern: $& in it stays $&.
    expect(renamedTitle("Rustler 10", "Rustler", "$&A")).toBe("$&A 10");
  });

  it("sets the stock on every variant row and on none of the image rows", () => {
    // A number none of them is on already, so every product really moves. Their Volkl stock is
    // mostly zero, and asking for zero would have quietly tested almost nothing.
    const plan: Plan = { scope: { vendors: ["Volkl"] }, operations: [{ kind: "setQuantity", value: 42 }] };
    const out = applyPlan(skis, plan);
    expect(out.refused).toBeUndefined();
    const before = table(skis), after = table(out.csv);
    const iQ = after.ix("Variant Inventory Qty"), iH = after.ix("Handle");
    const touched = new Set(out.changes.map((c) => c.handle));
    expect(touched.size).toBe(70);
    let variants = 0, images = 0;
    for (let r = 0; r < before.rows.length; r++) {
      if (!touched.has(before.rows[r][iH])) continue;
      if ((before.rows[r][iQ] ?? "").trim() === "") { images++; expect(after.rows[r][iQ] ?? "").toBe(""); }
      else { variants++; expect(after.rows[r][iQ]).toBe("42"); }
    }
    expect(variants).toBeGreaterThan(70);
    expect(images).toBeGreaterThan(0);
    expect(out.changes).toHaveLength(variants);
  });

  it("rounds a quantity to a whole number, because half a ski is not a thing", () => {
    const one = "Handle,Title,Variant Price,Variant Inventory Qty\r\nx,A ski,100.00,4\r\n";
    const out = applyPlan(one, { scope: {}, operations: [{ kind: "setQuantity", value: 2.6 }] });
    expect(out.changes[0].after).toBe("3");
  });

  it("says so when the file has no column to put it in", () => {
    const thin = "Handle,Title\r\nx,A ski\r\n";
    expect(applyPlan(thin, { scope: {}, operations: [{ kind: "setQuantity", value: 1 }] }).warnings.join(" "))
      .toContain("Variant Inventory Qty");
  });
});

/**
 * The two things the Swany run could not do.
 *
 * Both were real gaps rather than misreadings: there was no way to touch the SEO title at all,
 * and a scope that matched nothing said so without saying why.
 */
const SWANY = readFileSync("/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/1f150258-Swany_CSV_OLD.csv", "utf8");

describe("the SEO title", () => {
  it("takes the same year as the title, when the instruction asked for both", () => {
    const plan: Plan = { scope: { tags: ["2026"] }, operations: [{ kind: "setTitleYear", year: "2027", seo: true }] };
    const out = applyPlan(SWANY, plan);
    expect(out.refused).toBeUndefined();
    expect(out.matched).toBe(15);
    expect(new Set(out.changes.map((c) => c.column))).toEqual(new Set(["Title", "SEO Title"]));

    // Their SEO title is the product's title with the brand in front — 1,327 of the 1,433 that
    // have one carry the title verbatim — so the same edit reads correctly on both.
    const glove = out.changes.filter((c) => c.handle === "falcon-glove-ladies-sx-34l");
    expect(glove.find((c) => c.column === "Title")?.after).toBe("Falcon Glove Ladies SX-34L 2027");
    expect(glove.find((c) => c.column === "SEO Title")?.after).toContain("2027");
  });

  it("leaves the SEO title alone when it was not asked for", () => {
    const out = applyPlan(SWANY, { scope: { tags: ["2026"] }, operations: [{ kind: "setTitleYear", year: "2027" }] });
    expect(new Set(out.changes.map((c) => c.column))).toEqual(new Set(["Title"]));
  });

  it("says so when the file has no SEO Title column to write to", () => {
    const thin = "Handle,Title\r\nx,A glove\r\n";
    const out = applyPlan(thin, { scope: {}, operations: [{ kind: "renameTitle", find: "glove", replace: "mitt", seo: true }] });
    expect(out.warnings.join(" ")).toContain("SEO Title");
    expect(out.changes.map((c) => c.column)).toEqual(["Title"]);
  });
});

describe("pricing back up to the recommended retail", () => {
  it("puts the price back to Compare At and clears it, across the products asked for", () => {
    // "Bring them back to RRP" after a reorder: what the shop means by taking something off sale.
    const out = applyPlan(SWANY, { scope: { tags: ["2026"] }, operations: [{ kind: "endSale" }] });
    expect(out.refused).toBeUndefined();
    expect(out.matched).toBe(15);
    const priced = out.changes.filter((c) => c.column === "Variant Price");
    expect(priced.length).toBeGreaterThan(30);
    expect(priced.every((c) => Number(c.after) > Number(c.before))).toBe(true);
    expect(out.changes.filter((c) => c.column === "Variant Compare At Price").every((c) => c.after === "")).toBe(true);
  });
});

describe("why nothing matched", () => {
  it("names the part of the scope that ruled everything out", () => {
    // The commonest misreading: two tags in `tags` means BOTH on one product, and no Swany glove
    // is tagged 2026 and 2999 at once.
    const why = whyNoMatch(SWANY, { tags: ["2026", "2999"] });
    expect(why.join(" ")).toContain("fit everything except the tags it wanted ALL of");
    expect(why.join(" ")).toContain('tagged X or Y');
  });

  it("names a brand the file does not have", () => {
    const why = whyNoMatch(SWANY, { vendors: ["Hestra"], tags: ["2026"] });
    expect(why.join(" ")).toContain("15 products fit everything except the brand (Hestra)");
  });

  it("says nothing when the scope does match", () => {
    expect(whyNoMatch(SWANY, { tags: ["2026"] })).toEqual([]);
  });
});
