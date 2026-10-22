import type { TaxonomySection } from "../taxonomy";

/** The trade packs there are. Adding a trade is a new data file and a line in the registry. */
export type PackId = "snow-outdoor" | "outdoor" | "general";

/**
 * What one trade sells and how its documents read: data, not code. The engine reads whichever
 * pack the shop started from, and everything the shop teaches it (its store, its exports, its
 * corrections) is laid over the pack and wins where they disagree.
 */
export interface TradePack {
  id: PackId;
  /** As setup offers it. */
  name: string;
  /** One line for setup: who should start from this pack. */
  sells: string;
  /** The menu: kinds of product under the headings a shop in this trade files them under. */
  tree: TaxonomySection[];
  /** How each shelf tag is spelled, where the trade's shops agree on one. */
  tagSpelling: Record<string, string>;
  /** Tags a kind always carries alongside its own. */
  tagAlso: Record<string, readonly string[]>;
  /**
   * A few lines as this trade's invoices print them and as they should be read, given to the
   * invoice reader with every document. Made-up products only; never a real supplier's prices.
   */
  readerExamples: string[];
  /** Whether switching the pack on seeds its own starting rules (see seed.ts). */
  seeds: boolean;
}
