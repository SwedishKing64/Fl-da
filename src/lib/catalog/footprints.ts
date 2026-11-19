/**
 * Tents and their footprints (asked 2026-10-22).
 *
 * The shop lists a tent with two variants: the tent on its own, and the tent with its footprint.
 * Both carry the TENT's barcode. The footprint is also a product of its own ("Dagger 2P
 * Footprint"), with its own barcode. So:
 *
 *  - a tent arriving is counted onto the tent-alone variant (its barcode on two variants of one
 *    product is not a clash: the line is the tent);
 *  - a tent with its footprint can only be sold while both are in stock, so after a delivery the
 *    with-footprint variant is set to the smaller of the tent-alone count and the footprint's
 *    stock — never more than the tent alone, and nothing while there is no footprint;
 *  - a footprint arriving does the same to every tent it fits.
 *
 * A footprint fits a tent when its name, without "Footprint", is the tent's: "Dagger 2P Footprint"
 * fits "Dagger OSMO 2P Tent" (the OSMO is the tent's fabric, the footprint is the same), and not
 * "Dagger 3P". A tent two footprints fit equally is left alone and said so.
 */

import { quote, verifyOnlyIntended, type Change } from "./adjust";
import { parseCsv } from "./csv";

/**
 * An option meaning the tent WITH its footprint: "With Footprint", "Tent + Footprint", or an option
 * named Footprint set to Yes. Read as "name: value", since a shop writes it either way.
 */
export function isWithFootprint(option: string): boolean {
  const v = option.trim();
  return /footprint|\bfp\b/i.test(v) && !/\bwithout\b|\bno\b|\bnone\b|\bexcl|\balone\b|\bonly\b/i.test(v);
}

/** A product that is a footprint itself, by its name. */
export function isFootprintTitle(title: string): boolean {
  return /\bfootprints?\b|\bfp\b/i.test(title) && !/\btent\b.*\b(with|\+|and|&)\b.*\bfootprint\b/i.test(title);
}

const FILLER = new Set(["footprint", "footprints", "fp", "tent", "tents", "the", "with", "and", "nemo", "osmo"]);
const wordsOf = (title: string): string[] => title.toLowerCase().replace(/\b20\d{2}\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !FILLER.has(w));

/** How well a footprint's name fits a tent's: the number of its words the tent has, or 0 if any is missing. */
function fit(footprint: string, tent: string): number {
  const f = wordsOf(footprint), t = new Set(wordsOf(tent));
  if (f.length === 0) return 0;
  return f.every((w) => t.has(w)) ? f.length : 0;
}

/**
 * Of a tent's rows that share one barcode, the tent-alone row: where every other row is the tent
 * with its footprint. Null where that is not the picture.
 */
export function tentAloneRow(rows: number[], optionValuesOf: (row: number) => string[]): number | null {
  if (rows.length < 2) return null;
  const alone = rows.filter((r) => !optionValuesOf(r).some(isWithFootprint));
  const withIt = rows.filter((r) => optionValuesOf(r).some(isWithFootprint));
  return alone.length === 1 && withIt.length === rows.length - 1 ? alone[0] : null;
}

/**
 * Every with-footprint variant of the tents this delivery touched — a tent that arrived, or a tent
 * whose footprint arrived — set to the smaller of its tent-alone count and the footprint's stock.
 */
export function syncFootprintBundles(csv: string, touched: Set<string>): { csv: string; changes: Change[]; warnings: string[] } {
  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0] ?? [];
  const at = new Map(header.map((h, i) => [h, i]));
  const [H, T, Q, V] = [at.get("Handle"), at.get("Title"), at.get("Variant Inventory Qty"), at.get("Vendor")];
  const values = [1, 2, 3].map((n) => at.get(`Option${n} Value`));
  if (H === undefined || T === undefined || Q === undefined || touched.size === 0) return { csv, changes: [], warnings: [] };

  const rowsOf = new Map<string, number[]>();
  const titleOf = new Map<string, string>();
  const vendorOf = new Map<string, string>();
  let last = "";
  for (let r = 1; r < grid.length; r++) {
    const h = (grid[r][H] ?? "").trim() || last;
    last = h;
    rowsOf.set(h, [...(rowsOf.get(h) ?? []), r]);
    const title = (grid[r][T] ?? "").trim();
    if (title && !titleOf.has(h)) titleOf.set(h, title);
    const vendor = V === undefined ? "" : (grid[r][V] ?? "").trim();
    if (vendor && !vendorOf.has(h)) vendorOf.set(h, vendor);
  }
  const names = [1, 2, 3].map((n) => at.get(`Option${n} Name`));
  const firstOf = new Map<number, number>();
  for (const rows of rowsOf.values()) for (const r of rows) firstOf.set(r, rows[0]);
  // "name: value", the name from the product's first row, where Shopify writes it.
  const optionValues = (r: number) => values.map((i, k) => {
    if (i === undefined) return "";
    const n = names[k];
    const name = n === undefined ? "" : ((grid[r][n] ?? "").trim() || (grid[firstOf.get(r) ?? r][n] ?? "").trim());
    const value = (grid[r][i] ?? "").trim();
    return value ? `${name}: ${value}` : "";
  });
  const qty = (r: number) => { const n = Number((grid[r][Q] ?? "").trim()); return Number.isFinite(n) ? n : 0; };

  const footprints = [...titleOf].filter(([h, t]) => isFootprintTitle(t) && !(rowsOf.get(h) ?? []).some((r) => optionValues(r).some(isWithFootprint)));
  const tents = [...rowsOf].filter(([, rows]) => rows.some((r) => optionValues(r).some(isWithFootprint)) && rows.some((r) => !optionValues(r).some(isWithFootprint)));

  const changes: Change[] = [];
  const warnings: string[] = [];
  const set: string[] = [];
  for (const [tent, rows] of tents) {
    const tentTitle = titleOf.get(tent) ?? tent;
    const candidates = footprints
      .filter(([h]) => !vendorOf.get(h) || !vendorOf.get(tent) || vendorOf.get(h)!.toLowerCase() === vendorOf.get(tent)!.toLowerCase())
      .map(([h, t]) => ({ h, score: fit(t, tentTitle) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const footprint = best && candidates.filter((c) => c.score === best.score).length === 1 ? best.h : null;
    if (!touched.has(tent) && !(footprint && touched.has(footprint))) continue;
    if (!footprint) {
      if (touched.has(tent)) warnings.push(`${tentTitle}: ${candidates.length > 1 ? "more than one footprint fits it" : "no footprint listing fits it"}, so its with-footprint variant was left as it was.`);
      continue;
    }
    const footprintStock = (rowsOf.get(footprint) ?? []).reduce((n, r) => n + Math.max(0, qty(r)), 0);
    // Each with-footprint row against the tent-alone row it is the same as in every other option.
    const fpAt = values.findIndex((i, k) => i !== undefined && rows.some((r) => isWithFootprint(optionValues(r)[k])));
    const keyOf = (r: number) => optionValues(r).filter((_, k) => k !== fpAt).join("\u0000").toLowerCase();
    for (const r of rows.filter((x) => isWithFootprint(optionValues(x)[fpAt] ?? ""))) {
      const alone = rows.find((x) => x !== r && !isWithFootprint(optionValues(x)[fpAt] ?? "") && keyOf(x) === keyOf(r));
      if (alone === undefined) continue;
      const target = Math.max(0, Math.min(qty(alone), footprintStock));
      const before = (grid[r][Q] ?? "").trim();
      if (String(target) === before) continue;
      grid[r][Q] = String(target);
      changes.push({ handle: tent, title: r === rows[0] ? tentTitle : "", column: "Variant Inventory Qty", before, after: String(target) });
      set.push(`${tentTitle} with footprint → ${target}`);
    }
  }
  if (changes.length === 0) return { csv, changes, warnings };
  const out = grid.map((row) => header.map((_, i) => quote(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";
  const original = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const problems = verifyOnlyIntended(original, out, changes, { appended: 0 });
  if (problems.length > 0) return { csv, changes: [], warnings: [...warnings, "The tent-with-footprint counts were NOT updated: a check found other cells would have changed, which is a fault in this tool."] };
  return {
    csv: out,
    changes,
    warnings: [...warnings, `Tent-with-footprint variants set to the smaller of the tent alone and its footprint's stock: ${set.slice(0, 6).join(", ")}${set.length > 6 ? ", and more" : ""}.`],
  };
}
