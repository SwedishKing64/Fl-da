/**
 * The outdoor trade without the snow: tents, sleeping, packs, climbing, footwear, cooking and the
 * outdoor clothing a hiking and camping shop carries. Its menu is the outdoor half of the
 * snow-and-outdoor one, so the two spell their shared shelves the same way.
 */

import type { TaxonomySection } from "../taxonomy";
import { SNOW_OUTDOOR_TAXONOMY } from "./snow-outdoor";
import type { TradePack } from "./types";
import { GENERAL_METAFIELDS } from "../types";

const OUTDOOR_CLOTHING = new Set(["Outdoor Clothing", "Clothing Accessories"]);

const tree: TaxonomySection[] = SNOW_OUTDOOR_TAXONOMY
  .map((s) => (s.top === "Clothing" ? { ...s, groups: s.groups.filter((g) => OUTDOOR_CLOTHING.has(g.heading)) } : s))
  .filter((s) => s.top === "Outdoor" || s.top === "Clothing");


export const OUTDOOR_PACK: TradePack = {
  id: "outdoor",
  name: "Outdoor",
  sells: "Tents, sleeping bags and mats, packs, climbing, hiking footwear and outdoor clothing",
  tree,
  // Not the ski shop's spellings: they were one shop's tags, not the trade's. An outdoor shop's own
  // store teaches it how its tags are written.
  tagSpelling: {},
  tagAlso: {},
  readerExamples: [
    "A pack line \"PK-ATL-65-BLK Atlas Trek Pack 65L Black | 2 | 189.00\" reads as title Atlas Trek Pack, variant 65L with variantName Volume, colour Black, quantity 2, cost 189.",
    "A tent line \"Ridgeback 2P Tent Green\" reads as title Ridgeback Tent, variant 2P with variantName Capacity, colour Green, unless the brand's own model name carries the number.",
    "A sleeping bag line \"Alpine 900 Down Bag Long Left Zip\" reads as title Alpine 900 Down Bag, variant Long Left Zip with variantName Length / Zip.",
    "A clothing grid row \"OW3101 Ridge Fleece Jacket Black\" with 1 under S and 2 under M is two lines: size S quantity 1, size M quantity 2.",
  ],
  seeds: false,
  snowRules: false,
  metafields: GENERAL_METAFIELDS,
};
