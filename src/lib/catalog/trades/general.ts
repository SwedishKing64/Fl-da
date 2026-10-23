/** No trade at all: every kind of product, tag and option is learned from the shop's own store. */

import type { TradePack } from "./types";
import { GENERAL_METAFIELDS } from "../types";

export const GENERAL_PACK: TradePack = {
  id: "general",
  name: "Nothing: learn it all from my store",
  sells: "Any trade; Flöda learns your product types, tags and options from your own store",
  tree: [],
  tagSpelling: {},
  tagAlso: {},
  readerExamples: [],
  seeds: false,
  snowRules: false,
  shopifyCategories: {},
  fillsCategory: true,
  metafields: GENERAL_METAFIELDS,
};
