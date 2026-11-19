import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFile } from "./extract";
import { addToTally, emptyTally, fieldsPct, linesFromTable, regressions, scoreDocument, type CorpusKey, type Tally } from "./corpus";

const DIR = "samples/corpus";

/**
 * The synthetic corpus as a gate in the ordinary test run: no trade may score worse than its
 * recorded baseline. The real corpus runs the same way with `npm run eval:read`.
 */
describe("the reading corpus", () => {
  it("scores no trade worse than its baseline", async () => {
    const byTrade: Record<string, Tally> = {};
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".csv"))) {
      const key = JSON.parse(readFileSync(join(DIR, `${basename(f, extname(f))}.key.json`), "utf8")) as CorpusKey;
      const { table } = await extractFile(readFileSync(join(DIR, f)), f, "text/csv", "INVOICE");
      byTrade[key.trade] = addToTally(byTrade[key.trade] ?? emptyTally(), scoreDocument(linesFromTable(table), key));
    }
    const baseline = JSON.parse(readFileSync(join(DIR, "baseline.json"), "utf8"));
    expect(regressions(byTrade, baseline)).toEqual([]);
    expect(Object.keys(byTrade).length).toBeGreaterThanOrEqual(6);
    for (const t of Object.values(byTrade)) expect(fieldsPct(t)).toBeGreaterThan(0);
  });
});
