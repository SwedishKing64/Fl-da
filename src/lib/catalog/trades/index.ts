/**
 * The trade packs, by id. A pack is a starting point a shop may choose at setup; with none, every
 * kind of product, tag and option is learned from the shop's own store and paperwork.
 */

import { GENERAL_PACK } from "./general";
import { OUTDOOR_PACK } from "./outdoor";
import { BIKE_PACK } from "./bike";
import { SNOW_OUTDOOR_PACK } from "./snow-outdoor";
import type { PackId, TradePack } from "./types";

export type { PackId, TradePack } from "./types";

export const PACKS: Record<PackId, TradePack> = {
  general: GENERAL_PACK,
  outdoor: OUTDOOR_PACK,
  "snow-outdoor": SNOW_OUTDOOR_PACK,
  bike: BIKE_PACK,
};

/** The packs in the order setup offers them: none first. */
export const PACK_IDS = ["general", "outdoor", "snow-outdoor", "bike"] as const satisfies readonly PackId[];

/** The packs a shop can tick at setup: every one but none. */
export const PICKABLE_PACKS = PACK_IDS.filter((id) => id !== "general");

/** The packs a profile names: one id, or several joined by "+" ("outdoor+bike"). Unknown ids are dropped. */
export function packIds(id: string | null | undefined): PackId[] {
  const known = new Set<string>(PACK_IDS);
  return Array.from(new Set((id ?? "").split("+").map((s) => s.trim()).filter((s): s is PackId => known.has(s) && s !== "general")));
}

/** Whether a profile's packs are all known ones. */
export const isPackSet = (id: string): boolean => id === "general" || (id.split("+").length === packIds(id).length && packIds(id).length > 0);

/**
 * The pack a shop starts from: one pack, or the packs it ticked laid together — a camping shop
 * that also sells bikes has both menus, both trades' examples and both trades' categories. No
 * pack where none is named or the ids are unknown (a profile saved by an older version).
 */
export function packFor(id: string | null | undefined): TradePack {
  const ids = packIds(id);
  if (ids.length === 0) return GENERAL_PACK;
  if (ids.length === 1) return PACKS[ids[0]];
  return combinePacks(ids.map((i) => PACKS[i]));
}

function combinePacks(packs: TradePack[]): TradePack {
  const tree: TradePack["tree"] = [];
  for (const section of packs.flatMap((p) => p.tree)) {
    const have = tree.find((s) => s.top === section.top);
    if (!have) { tree.push({ top: section.top, groups: section.groups.map((g) => ({ ...g, leaves: [...g.leaves] })) }); continue; }
    for (const group of section.groups) {
      const g = have.groups.find((x) => x.heading === group.heading);
      if (!g) have.groups.push({ ...group, leaves: [...group.leaves] });
      else for (const leaf of group.leaves) if (!g.leaves.includes(leaf)) g.leaves.push(leaf);
    }
  }
  const snow = packs.some((p) => p.snowRules);
  return {
    id: packs.map((p) => p.id).join("+"),
    name: packs.map((p) => p.name).join(" and "),
    sells: packs.map((p) => p.sells).join("; "),
    tree,
    tagSpelling: Object.assign({}, ...packs.map((p) => p.tagSpelling)),
    tagAlso: Object.assign({}, ...packs.map((p) => p.tagAlso)),
    readerExamples: packs.flatMap((p) => p.readerExamples),
    seeds: packs.some((p) => p.seeds),
    snowRules: snow,
    shopifyCategories: Object.assign({}, ...packs.map((p) => p.shopifyCategories)),
    // The ski shop's habit of leaving most products uncategorised is its own; a shop that ticked
    // several trades is a new shop and gets the category Shopify asks for.
    fillsCategory: true,
    metafields: snow ? packs.find((p) => p.snowRules)!.metafields : packs[0].metafields,
    ...(packs.some((p) => p.knowledge) ? {
      knowledge: {
        verified: packs.every((p) => p.knowledge?.verified ?? true),
        kinds: packs.flatMap((p) => p.knowledge?.kinds ?? []),
        sizes: packs.flatMap((p) => p.knowledge?.sizes ?? []),
        colours: Object.assign({}, ...packs.map((p) => p.knowledge?.colours ?? {})),
      },
    } : {}),
  };
}
