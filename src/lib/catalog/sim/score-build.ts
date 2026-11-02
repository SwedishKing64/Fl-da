/**
 * How the build did against what a simulated delivery should have become.
 *
 * The reader's score (corpus.ts) says whether the lines were read; this says whether they were
 * made into the right products: one per model, its variants all there, its options the ones
 * ordered, filed under a type the shop has, priced at the RRP and above cost, with the barcodes
 * kept, and a CSV and a push input Shopify would take.
 */

import { validateCsvFile } from "../csv";
import { buildProductSetInput } from "../shopify";
import type { ReviewProduct } from "../review-types";
import type { BuildExpectation, ExpectedProduct } from "./documents";

export interface BuildScore {
  productsExpected: number;
  productsBuilt: number;
  /** Expected models a built product was found for. */
  modelsFound: number;
  /** Of those, with the same number of variants. */
  variantsRight: number;
  /** Of those, every ordered option value on some variant. */
  optionsRight: number;
  /** Built products whose Type is one the shop lists. */
  typed: number;
  /** Reorders placed on the shop's existing listing. */
  reordersExpected: number;
  reordersPlaced: number;
  /** Variants priced at or above cost, and at the RRP where one was given. */
  variantsPricedOk: number;
  variantsOf: number;
  barcodesKept: number;
  /** No blocking error, a CSV that validates, and a push input for every product. */
  exportable: boolean;
  problems: string[];
}

const clean = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findProduct(e: ExpectedProduct, products: ReviewProduct[], used: Set<string>): ReviewProduct | null {
  const want = clean(e.name);
  const candidates = products.filter((p) => !used.has(p.id) && clean(p.title).includes(want));
  // Where the kind is gendered and the shop splits by gender, the product named for it.
  const hit = candidates.find((p) => !e.gender || clean(p.title).includes(clean(e.gender)) || clean(p.tags).includes(e.gender === "Men's" ? "mens" : "womens")) ?? candidates[0] ?? null;
  if (hit) used.add(hit.id);
  return hit;
}

export function scoreBuild(result: { products: ReviewProduct[]; csv: string; errors: string[] }, expect: BuildExpectation, shopTypes: string[]): BuildScore {
  const problems: string[] = [];
  const used = new Set<string>();
  let modelsFound = 0, variantsRight = 0, optionsRight = 0, reordersPlaced = 0;
  const types = new Set(shopTypes.map(clean));
  // The longest names first, so "Flight Deck L" takes its own product before "Flight Deck" can.
  for (const e of [...expect.products].sort((a, b) => b.name.length - a.name.length)) {
    const p = findProduct(e, result.products, used);
    if (!p) { problems.push(`${e.brand} ${e.gender} ${e.name}: no product built for it`.replace(/\s+/g, " ")); continue; }
    modelsFound++;
    if (p.variants.length === e.variants) variantsRight++;
    else problems.push(`${e.name}: ${p.variants.length} variants built, ${e.variants} ordered`);
    const values = new Set(p.variants.flatMap((v) => [v.option1Value, v.option2Value, v.option3Value]).map((v) => clean(String(v ?? ""))));
    const missing = Object.entries(e.options).flatMap(([name, vs]) => vs.filter((v) => !values.has(clean(v))).map((v) => `${name} ${v}`));
    if (missing.length === 0) optionsRight++;
    else problems.push(`${e.name}: options not on any variant: ${missing.join(", ")}`);
    if (e.reorderHandle) {
      if (p.handle === e.reorderHandle) reordersPlaced++;
      else problems.push(`${e.name}: a reorder of ${e.reorderHandle}, built as ${p.handle}`);
    }
  }
  const typed = result.products.filter((p) => types.has(clean(p.productType))).length;
  for (const p of result.products) if (!types.has(clean(p.productType))) problems.push(`${p.title}: Type "${p.productType}" is not one the shop has`);
  const variants = result.products.flatMap((p) => p.variants);
  const pricedOk = variants.filter((v) => v.retailPrice >= v.landedCostHome && (v.retailOverride === null || Math.abs(v.retailPrice - v.retailOverride) < 0.01)).length;
  for (const v of variants) if (v.retailPrice < v.landedCostHome) problems.push(`${v.sku}: priced ${v.retailPrice} under its cost ${v.landedCostHome}`);
  const barcodesKept = variants.filter((v) => /^\d{13}$/.test(v.barcode)).length;
  let pushOk = true;
  for (const p of result.products) {
    try { buildProductSetInput(p, { publish: false, locationId: null }); } catch (err) { pushOk = false; problems.push(`${p.title}: push input failed: ${err instanceof Error ? err.message : err}`); }
  }
  const csvErrors = validateCsvFile(result.csv).filter((i) => i.level === "error");
  for (const i of csvErrors.slice(0, 3)) problems.push(`CSV: ${i.message}`);
  for (const e of result.errors.slice(0, 3)) problems.push(`blocked: ${e}`);
  const reordersExpected = expect.products.filter((e) => e.reorderHandle).length;
  return {
    productsExpected: expect.products.length, productsBuilt: result.products.length, modelsFound, variantsRight, optionsRight, typed,
    reordersExpected, reordersPlaced, variantsPricedOk: pricedOk, variantsOf: variants.length, barcodesKept,
    exportable: pushOk && csvErrors.length === 0 && result.errors.length === 0, problems,
  };
}

export interface BuildTally {
  documents: number;
  productsExpected: number;
  modelsFound: number;
  variantsRight: number;
  optionsRight: number;
  productsBuilt: number;
  typed: number;
  reordersExpected: number;
  reordersPlaced: number;
  variantsOf: number;
  variantsPricedOk: number;
  barcodesKept: number;
  exportable: number;
}

export const emptyBuildTally = (): BuildTally => ({ documents: 0, productsExpected: 0, modelsFound: 0, variantsRight: 0, optionsRight: 0, productsBuilt: 0, typed: 0, reordersExpected: 0, reordersPlaced: 0, variantsOf: 0, variantsPricedOk: 0, barcodesKept: 0, exportable: 0 });

export function addBuild(t: BuildTally, s: BuildScore): BuildTally {
  return {
    documents: t.documents + 1,
    productsExpected: t.productsExpected + s.productsExpected,
    modelsFound: t.modelsFound + s.modelsFound,
    variantsRight: t.variantsRight + s.variantsRight,
    optionsRight: t.optionsRight + s.optionsRight,
    productsBuilt: t.productsBuilt + s.productsBuilt,
    typed: t.typed + s.typed,
    reordersExpected: t.reordersExpected + s.reordersExpected,
    reordersPlaced: t.reordersPlaced + s.reordersPlaced,
    variantsOf: t.variantsOf + s.variantsOf,
    variantsPricedOk: t.variantsPricedOk + s.variantsPricedOk,
    barcodesKept: t.barcodesKept + s.barcodesKept,
    exportable: t.exportable + (s.exportable ? 1 : 0),
  };
}

const pct = (a: number, b: number): number => (b === 0 ? 100 : Math.round((a / b) * 1000) / 10);
export const modelsPct = (t: BuildTally) => pct(t.modelsFound, t.productsExpected);
export const variantsPct = (t: BuildTally) => pct(t.variantsRight, t.productsExpected);
export const typedPct = (t: BuildTally) => pct(t.typed, t.productsBuilt);
export const pricedPct = (t: BuildTally) => pct(t.variantsPricedOk, t.variantsOf);
export const exportablePct = (t: BuildTally) => pct(t.exportable, t.documents);
