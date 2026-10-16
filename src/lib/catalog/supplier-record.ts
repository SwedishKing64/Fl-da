/**
 * How a supplier's paperwork reads: the record, worked out from what people changed after it was
 * read. Pure; `supplier-score.ts` gathers the rows from the database.
 *
 * The measure is products a person touched on the review grid after the build, over products
 * built, across the supplier's finished imports. It is honest in a way a confidence score is not:
 * it counts what somebody actually had to fix. A new supplier has no record, which is the moment
 * to look harder — the first invoice from a layout nobody has seen is where the cost column, the
 * currency, the sizes and the barcodes are most likely to come out wrong.
 */

export interface BatchRecord {
  /** Products built in the batch. */
  products: number;
  /** Products a person changed on the review grid after the build. */
  touched: number;
  /** Exported, so it was checked all the way through. */
  finished: boolean;
}

export interface SupplierRecord {
  supplierId: string;
  name: string;
  /** Finished imports before this one. */
  imports: number;
  products: number;
  touched: number;
  /** Share of products touched over the finished imports; null until there is one with products. */
  share: number | null;
}

export function recordFrom(supplierId: string, name: string, batches: BatchRecord[]): SupplierRecord {
  const finished = batches.filter((b) => b.finished && b.products > 0);
  const products = finished.reduce((n, b) => n + b.products, 0);
  const touched = finished.reduce((n, b) => n + Math.min(b.touched, b.products), 0);
  return { supplierId, name, imports: finished.length, products, touched, share: products > 0 ? touched / products : null };
}

/** The share of products touched under which a supplier's paperwork counts as reading clean. */
export const READS_CLEAN_SHARE = 0.2;

/**
 * Whether the supplier's paperwork is known well enough to read on the lighter model: at least one
 * finished import, and no more than a fifth of its products changed after reading. The record keeps
 * watching, so a supplier whose paperwork starts reading badly goes back to the full model by itself.
 */
export function readsKnown(r: SupplierRecord | null | undefined): boolean {
  return Boolean(r && r.share !== null && r.imports >= 1 && r.share <= READS_CLEAN_SHARE);
}

/** The record in a word, for a badge: how much a person usually has to change. */
export function recordWord(r: SupplierRecord): { word: string; tone: "success" | "info" | "warning" | "neutral" } {
  if (r.share === null) return { word: "no record yet", tone: "neutral" };
  if (r.share <= 0.05) return { word: "reads clean", tone: "success" };
  if (r.share <= 0.2) return { word: "mostly clean", tone: "info" };
  return { word: "needs a look", tone: "warning" };
}

/** One line a person reads on the review page. */
export function describeRecord(r: SupplierRecord): string {
  if (r.share === null) return `${r.name}: no finished import yet, so there is no record of how its paperwork reads.`;
  const pct = Math.round(r.share * 100);
  const imports = `${r.imports} finished import${r.imports === 1 ? "" : "s"}`;
  const lighter = " Its paperwork is read on the lighter model, at about half the reading cost.";
  if (r.share <= 0.05) return `${r.name} reads clean: over ${imports}, ${pct}% of products needed a change after reading.${lighter}`;
  if (r.share <= READS_CLEAN_SHARE) return `${r.name} reads mostly clean: over ${imports}, ${pct}% of products needed a change after reading.${lighter}`;
  return `${r.name} needs a look: over ${imports}, ${pct}% of products needed a change after reading. Check the columns below more closely than usual.`;
}

/**
 * What to check first on the first invoice from a supplier: the things a new layout gets wrong,
 * in the order they cost the most if missed.
 */
export const FIRST_INVOICE_CHECKS: Array<{ what: string; why: string }> = [
  { what: "Cost price and currency", why: "The column read as cost must be what you pay per unit, in the currency the batch says. A list price or a line total here is a wrong margin on everything." },
  { what: "Quantities", why: "Ordered, not shipped or back-ordered; and per unit, not per carton." },
  { what: "Sizes and colours", why: "Each should be an option on the product, not part of the name, and every variant should have its value." },
  { what: "SKUs and barcodes", why: "The supplier's code in the SKU column, the EAN in the barcode column — not swapped, and not a description." },
  { what: "Kind of product and tags", why: "The first invoice is where a kind the shop has not met is filed somewhere odd. Fix it once here and the rule is kept." },
];
