/**
 * Score the reader against a corpus of documents with checked answers.
 *
 *   npm run eval:read                         # the synthetic corpus in samples/corpus
 *   CORPUS_DIR=/private/corpus npm run eval:read -- --baseline samples/corpus/baseline.json
 *   npm run eval:read -- --write-baseline samples/corpus/baseline.json
 *
 * Each document sits beside its answer key: `order.xlsx` and `order.key.json` (see
 * src/lib/catalog/corpus.ts for the key's shape). Real invoices carry wholesale costs, so the real
 * corpus lives outside the repository and is pointed at with CORPUS_DIR; the synthetic one in
 * samples/corpus holds made-up suppliers and prices only. PDFs and photos need ANTHROPIC_API_KEY;
 * without it they are listed as skipped, not scored.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { extractFile } from "../src/lib/catalog/extract";
import { aiAvailable } from "../src/lib/catalog/anthropic";
import { activateConventions, BLANK_CONVENTIONS } from "../src/lib/catalog/taxonomy";
import { isPackSet } from "../src/lib/catalog/trades";
import { addToTally, emptyTally, fieldsPct, linesFromTable, linesPct, regressions, scoreDocument, type CorpusKey, type Tally } from "../src/lib/catalog/corpus";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dir = process.env.CORPUS_DIR || flag("--dir") || "samples/corpus";
const verbose = args.includes("--verbose");
// Read as a shop that started from these packs ("bike", "outdoor+bike"), or from none: run once
// with and once without to see what a pack is worth on the same documents.
const pack = flag("--pack");
if (pack) {
  if (!isPackSet(pack)) throw new Error(`No pack called ${pack}.`);
  activateConventions({ ...BLANK_CONVENTIONS, pack });
}

const MIME: Record<string, string> = { ".csv": "text/csv", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain" };

async function main() {
  if (!existsSync(dir)) throw new Error(`No corpus at ${dir}.`);
  const files = readdirSync(dir).filter((f) => !f.endsWith(".key.json") && !f.endsWith(".json") && !f.startsWith(".") && f !== "README.md");
  const byTrade: Record<string, Tally> = {};
  const byKind: Record<string, Tally> = {};
  let all = emptyTally();
  const skipped: string[] = [];
  for (const f of files.sort()) {
    const keyPath = join(dir, `${basename(f, extname(f))}.key.json`);
    if (!existsSync(keyPath)) { skipped.push(`${f} (no answer key)`); continue; }
    const ext = extname(f).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    if (![".csv", ".xlsx"].includes(ext) && !aiAvailable()) { skipped.push(`${f} (needs ANTHROPIC_API_KEY)`); continue; }
    const key = JSON.parse(readFileSync(keyPath, "utf8")) as CorpusKey & { checked?: boolean };
    // A key drafted by scripts/redact.ts is the reader's own reading until a person has checked it.
    if (key.checked === false) { skipped.push(`${f} (answer key not checked yet)`); continue; }
    const started = Date.now();
    const { table } = await extractFile(readFileSync(join(dir, f)), f, mime, "INVOICE");
    const score = scoreDocument(linesFromTable(table), key);
    byTrade[key.trade] = addToTally(byTrade[key.trade] ?? emptyTally(), score);
    byKind[key.kind] = addToTally(byKind[key.kind] ?? emptyTally(), score);
    all = addToTally(all, score);
    const one = addToTally(emptyTally(), score);
    console.log(`${f.padEnd(40)} ${key.trade.padEnd(10)} lines ${String(score.found).padStart(3)}/${String(score.expected).padEnd(3)} fields ${String(fieldsPct(one)).padStart(5)}%  ${score.addsUp === null ? "" : score.addsUp ? "adds up" : "DOES NOT ADD UP"}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (verbose || score.missed.length || score.wrong.length) {
      for (const m of score.missed.slice(0, 8)) console.log(`    missed ${m}`);
      for (const w of score.wrong.slice(0, 8)) console.log(`    ${w}`);
    }
  }
  const row = (name: string, t: Tally) => console.log(`${name.padEnd(14)} ${String(t.documents).padStart(4)} docs  lines found ${String(linesPct(t)).padStart(5)}%  fields right ${String(fieldsPct(t)).padStart(5)}%  extra lines ${t.extra}${t.totalsChecked ? `  add up ${t.addsUp}/${t.totalsChecked}` : ""}`);
  console.log("\nBy trade");
  for (const [k, t] of Object.entries(byTrade).sort()) row(k, t);
  console.log("\nBy kind of document");
  for (const [k, t] of Object.entries(byKind).sort()) row(k, t);
  console.log("");
  row("ALL", all);
  if (skipped.length) console.log(`\nSkipped: ${skipped.join(", ")}`);

  const summary = Object.fromEntries(Object.entries(byTrade).map(([k, t]) => [k, { fields: fieldsPct(t), lines: linesPct(t) }]));
  const write = flag("--write-baseline");
  if (write) { writeFileSync(write, JSON.stringify(summary, null, 2) + "\n"); console.log(`\nBaseline written to ${write}.`); }
  const compare = flag("--baseline");
  if (compare) {
    const fell = regressions(byTrade, JSON.parse(readFileSync(compare, "utf8")));
    if (fell.length) { console.error(`\nWorse than the baseline:\n  ${fell.join("\n  ")}`); process.exit(1); }
    console.log("\nNo trade is worse than the baseline.");
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
