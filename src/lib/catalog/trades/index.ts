/**
 * The trade packs, by id. A pack is a starting point a shop may choose at setup; with none, every
 * kind of product, tag and option is learned from the shop's own store and paperwork.
 */

import { GENERAL_PACK } from "./general";
import { OUTDOOR_PACK } from "./outdoor";
import { SNOW_OUTDOOR_PACK } from "./snow-outdoor";
import type { PackId, TradePack } from "./types";

export type { PackId, TradePack } from "./types";

export const PACKS: Record<PackId, TradePack> = {
  general: GENERAL_PACK,
  outdoor: OUTDOOR_PACK,
  "snow-outdoor": SNOW_OUTDOOR_PACK,
};

/** The packs in the order setup offers them: none first. */
export const PACK_IDS = ["general", "outdoor", "snow-outdoor"] as const satisfies readonly PackId[];

/** The pack for an id, or no pack where the id is unknown (a profile saved by an older version). */
export function packFor(id: string | null | undefined): TradePack {
  return PACKS[(id ?? "general") as PackId] ?? GENERAL_PACK;
}
