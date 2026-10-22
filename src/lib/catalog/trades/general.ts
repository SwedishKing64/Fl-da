/** No trade at all: every kind of product, tag and option is learned from the shop's own store. */

import type { TradePack } from "./types";

export const GENERAL_PACK: TradePack = {
  id: "general",
  name: "Nothing: learn it all from my store",
  sells: "Any trade; Flöda learns your kinds of product, tags and options from your own store",
  tree: [],
  tagSpelling: {},
  tagAlso: {},
  readerExamples: [],
  seeds: false,
  snowRules: false,
};
