/**
 * Run Flöda against shops it has never seen: made-up shops in several trades, each with its own
 * export and a season of deliveries in the layouts suppliers use, read and built and scored.
 *
 *   npm run eval:shops                                  # every trade, two shops each, by code only
 *   npm run eval:shops -- --trades bike,surf --shops 3 --seed 5
 *   npm run eval:shops -- --ai                          # also the printed pages: text, PDF, photo (needs ANTHROPIC_API_KEY)
 *   npm run eval:shops -- --out /tmp/sim-shops          # write every shop's export and invoices, to load into the app
 *   npm run eval:shops -- --write-baseline samples/sim-baseline.json
 *   npm run eval:shops -- --baseline samples/sim-baseline.json   # fail where a trade got worse
 *
 * Nothing here touches a database or the network except the model, under --ai. The reading is
 * scored with corpus.ts, the build with sim/score-build.ts, by trade and by layout.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractFile } from "../src/lib/catalog/extract";
import { isReaderTable, readerMapping } from "../src/lib/catalog/extract/ai";
import { aiAvailable } from "../src/lib/catalog/anthropic";
import { suggestMapping, type Mapping } from "../src/lib/catalog/mapping";
import { activateConventions } from "../src/lib/catalog/taxonomy";
import { defaultHouseFor } from "../src/lib/catalog/house";
import { learnVocabulary } from "../src/lib/catalog/learn";
import { listingsFromCsv } from "../src/lib/catalog/shop-memory";
import { runOffline } from "../src/lib/catalog/offline";
import { DEFAULT_SETTINGS } from "../src/lib/catalog/types";
import { addToTally, emptyTally, fieldsPct, linesFromTable, linesPct, scoreDocument, type Tally } from "../src/lib/catalog/corpus";
import { LAYOUTS, type SimDocument } from "../src/lib/catalog/sim/documents";
import { addBuild, emptyBuildTally, exportablePct, modelsPct, pricedPct, scoreBuild, typedPct, variantsPct, type BuildTally } from "../src/lib/catalog/sim/score-build";
import { Rng } from "../src/lib/catalog/sim/rng";
import { makeDelivery, makeShop, shopExportCsv, TRADES, type Shop } from "../src/lib/catalog/sim/world";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const trades = (flag("--trades") ?? TRADES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const shopsPerTrade = Number(flag("--shops") ?? 2);
const seed = Number(flag("--seed") ?? 1);
const withAi = args.includes("--ai");
const verbose = args.includes("--verbose");
const out = flag("--out");
const only = flag("--layouts")?.split(",").map((s) => s.trim());

interface Row { shop: string; trade: string; layout: string; file: string; lines: string; fields: number; build: ReturnType<typeof scoreBuild>; problems: string[]; seconds: number }

/** The shop's conventions in force, as the app has them after setup taught it from the export. */
function becomeShop(shop: Shop, exportCsv: string) {
  const listings = listingsFromCsv(exportCsv);
  activateConventions({ pack: shop.pack, learned: learnVocabulary(listings, "export.csv"), marker: "", house: defaultHouseFor(shop.pack) });
  return listings;
}

async function main() {
  if (withAi && !aiAvailable()) throw new Error("--ai needs ANTHROPIC_API_KEY.");
  const byTrade: Record<string, { read: Tally; build: BuildTally }> = {};
  const byLayout: Record<string, { read: Tally; build: BuildTally }> = {};
  const rows: Row[] = [];
  const skipped: string[] = [];
  const tally = (into: Record<string, { read: Tally; build: BuildTally }>, key: string, read: ReturnType<typeof scoreDocument>, build: ReturnType<typeof scoreBuild>) => {
    const t = into[key] ?? { read: emptyTally(), build: emptyBuildTally() };
    into[key] = { read: addToTally(t.read, read), build: addBuild(t.build, build) };
  };

  for (const trade of trades) {
    for (let n = 0; n < shopsPerTrade; n++) {
      const shop = makeShop(trade, seed * 100 + n);
      const exportCsv = shopExportCsv(shop);
      const listings = becomeShop(shop, exportCsv);
      const shopTypes = [...new Set(shop.listed.map((m) => m.kind.type))];
      const rng = new Rng(shop.seed + 17);
      const dir = out ? join(out, `${trade}-${shop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${n + 1}`) : null;
      if (dir) { mkdirSync(join(dir, "invoices"), { recursive: true }); writeFileSync(join(dir, "export.csv"), exportCsv); }
      // A season: every layout once, each on a delivery of its own; a distributor's for the multi-brand one.
      const docs: SimDocument[] = [];
      for (const layout of LAYOUTS) {
        if (only && !only.includes(layout.id)) continue;
        if (layout.needsAi && !withAi) { skipped.push(`${layout.id} (needs --ai)`); continue; }
        const suppliers = layout.id.startsWith("multi") ? rng.some(shop.suppliers, 2, 3) : [rng.pick(shop.suppliers)];
        const delivery = makeDelivery(shop, suppliers, rng);
        if (delivery.lines.length === 0) { skipped.push(`${layout.id} for ${shop.name} (nothing ordered)`); continue; }
        if (!layout.fits(delivery)) {
          // A grid needs sized goods: try a delivery of only those.
          const sized = { ...delivery, lines: delivery.lines.filter((l) => l.variant.options.Size !== undefined || l.variant.options.Length !== undefined) };
          if (sized.lines.length === 0 || !layout.fits(sized)) { skipped.push(`${layout.id} for ${shop.name} (nothing sized to order)`); continue; }
          docs.push(await layout.render(sized, shop, rng));
        } else docs.push(await layout.render(delivery, shop, rng));
      }
      for (const d of docs) {
        if (dir) { writeFileSync(join(dir, "invoices", d.filename), d.data); writeFileSync(join(dir, "invoices", `${d.filename.replace(/\.[^.]+$/, "")}.key.json`), JSON.stringify({ ...d.key, expect: d.expect }, null, 2)); }
        const started = Date.now();
        const { table } = await extractFile(d.data, d.filename, d.mime, "INVOICE");
        const read = scoreDocument(linesFromTable(table), d.key);
        const mapping: Mapping = isReaderTable(table.headers) ? readerMapping(table.headers) : suggestMapping(table.headers, table.rows);
        // The brand as the mapping screen fixes it from the supplier, where the file carries none.
        const fixed = d.brands.length === 1 ? { brand: d.brands[0] } : {};
        const built = runOffline(table, mapping, { fixed }, { currency: "AUD", fxRateToHome: 1, gstTreatment: "EXCLUSIVE", freightTotalHome: 0, freightMode: "PER_UNIT" }, [], DEFAULT_SETTINGS, { listings });
        const build = scoreBuild(built, d.expect, shopTypes);
        tally(byTrade, trade, read, build);
        tally(byLayout, d.layout, read, build);
        const one = addToTally(emptyTally(), read);
        rows.push({ shop: shop.name, trade, layout: d.layout, file: d.filename, lines: `${read.found}/${read.expected}`, fields: fieldsPct(one), build, problems: [...read.missed.map((m) => `missed ${m}`), ...read.wrong, ...build.problems], seconds: (Date.now() - started) / 1000 });
      }
    }
  }

  for (const r of rows) {
    console.log(`${r.trade.padEnd(8)} ${r.layout.padEnd(20)} ${r.file.padEnd(38)} lines ${r.lines.padEnd(6)} fields ${String(r.fields).padStart(5)}%  models ${r.build.modelsFound}/${r.build.productsExpected} variants ${r.build.variantsRight}/${r.build.productsExpected} typed ${r.build.typed}/${r.build.productsBuilt}${r.build.reordersExpected ? ` reorders ${r.build.reordersPlaced}/${r.build.reordersExpected}` : ""} ${r.build.exportable ? "exportable" : "NOT EXPORTABLE"} ${r.seconds.toFixed(1)}s`);
    for (const p of r.problems.slice(0, verbose ? 40 : 6)) console.log(`    ${p}`);
    if (!verbose && r.problems.length > 6) console.log(`    … and ${r.problems.length - 6} more (--verbose)`);
  }
  const row = (name: string, t: { read: Tally; build: BuildTally }) => console.log(`${name.padEnd(20)} ${String(t.read.documents).padStart(3)} docs  lines ${String(linesPct(t.read)).padStart(5)}%  fields ${String(fieldsPct(t.read)).padStart(5)}%  models ${String(modelsPct(t.build)).padStart(5)}%  variants ${String(variantsPct(t.build)).padStart(5)}%  typed ${String(typedPct(t.build)).padStart(5)}%  priced ${String(pricedPct(t.build)).padStart(5)}%  exportable ${String(exportablePct(t.build)).padStart(5)}%`);
  console.log("\nBy trade");
  for (const [k, t] of Object.entries(byTrade).sort()) row(k, t);
  console.log("\nBy layout");
  for (const [k, t] of Object.entries(byLayout).sort()) row(k, t);
  const all = { read: emptyTally(), build: emptyBuildTally() };
  for (const t of Object.values(byTrade)) {
    for (const k of Object.keys(all.read) as Array<keyof Tally>) all.read[k] += t.read[k];
    for (const k of Object.keys(all.build) as Array<keyof BuildTally>) all.build[k] += t.build[k];
  }
  console.log("");
  row("ALL", all);
  if (skipped.length) console.log(`\nSkipped: ${[...new Set(skipped)].join(", ")}`);
  if (out) console.log(`\nShops written under ${out}: each has export.csv (load it at setup or on Prices and stock) and invoices/ with a .key.json beside each saying what it should read as.`);

  const summary = Object.fromEntries(Object.entries(byTrade).map(([k, t]) => [k, { lines: linesPct(t.read), fields: fieldsPct(t.read), models: modelsPct(t.build), variants: variantsPct(t.build), typed: typedPct(t.build), priced: pricedPct(t.build), exportable: exportablePct(t.build) }]));
  const write = flag("--write-baseline");
  if (write) { writeFileSync(write, JSON.stringify(summary, null, 2) + "\n"); console.log(`\nBaseline written to ${write}.`); }
  const compare = flag("--baseline");
  if (compare) {
    if (!existsSync(compare)) throw new Error(`No baseline at ${compare}.`);
    const was = JSON.parse(readFileSync(compare, "utf8")) as Record<string, Record<string, number>>;
    const fell: string[] = [];
    for (const [trade, b] of Object.entries(was)) {
      const now = summary[trade];
      if (!now) continue;
      for (const [measure, value] of Object.entries(b)) if ((now as Record<string, number>)[measure] < value - 0.5) fell.push(`${trade}: ${measure} ${(now as Record<string, number>)[measure]}% against a baseline of ${value}%`);
    }
    if (fell.length) { console.error(`\nWorse than the baseline:\n  ${fell.join("\n  ")}`); process.exit(1); }
    console.log("\nNo trade is worse than the baseline.");
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.stack ?? err.message : err); process.exit(1); });
