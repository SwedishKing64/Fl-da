import type { TaxonomySection } from "../taxonomy";
import type { MetafieldDef } from "../types";
import type { PackKnowledge } from "./knowledge";

/** The trade packs there are. Adding a trade is a new data file and a line in the registry. */
export type PackId = "snow-outdoor" | "outdoor" | "bike" | "general";

/**
 * What one trade sells and how its documents read: data, not code. The engine reads whichever
 * pack the shop started from, and everything the shop teaches it (its store, its exports, its
 * corrections) is laid over the pack and wins where they disagree.
 */
export interface TradePack {
  /** The pack's id, or several joined by "+" where a shop started from more than one. */
  id: string;
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
  /**
   * Whether the ski and snowboard rules apply: snowboard boots and bindings told from ski ones by
   * the brand, accessories filed under Ski or Snowboard Accessories, skis sent mounted named as
   * binding packages, riding-style shelves read from a supplier's terrain words. Off, a glove is
   * a glove and a boot is a boot; the shop's own store says where they go.
   */
  snowRules: boolean;
  /** Each kind of product's place in Shopify's Standard Product Taxonomy, by the category's id. */
  shopifyCategories: Record<string, string>;
  /**
   * Whether every product goes out with its Shopify category filled in. The ski shop's own exports
   * leave most of the catalogue Uncategorized and fill only boards, downhill skis and sleeping bags,
   * so its pack keeps that habit; every other shop gets the category Shopify asks for.
   */
  fillsCategory: boolean;
  /** The product metafields a shop on this pack writes, and under which namespace. */
  metafields: MetafieldDef[];
  /** What a pack built from files knows beyond its menu: kinds, sizes, colour shorthand. See knowledge.ts. */
  knowledge?: PackKnowledge;
  /** Brands the trade knows, so a brand in a file's name or tab can be told from a product's. The shop's own vendors join them. */
  brands?: string[];
  /** Distributors who send several brands on one order: never a brand, never a vendor. */
  distributors?: string[];
  /** Brands that make snowboard gear and no ski gear (the snow trade's). */
  snowboardBrands?: string[];
}
