/**
 * Variants in the order a shopper reads them: XS before S before M, 27.5" before 29", 160mm before
 * 180mm — the order of the size system the trade uses, from its pack (see trades/knowledge.ts), not
 * the order the supplier happened to print the lines in. Options no size system covers keep the
 * order they were first met in, so a product's colours stay grouped as the invoice had them.
 */

import type { SizeSystem } from "./trades/knowledge";

const plain = (v: string) => v.trim().toLowerCase().replace(/["”″\s]/g, "").replace(/inch(es)?$|in$/, "");

/** The rank of each value in the first size system that holds every one of them, or null where none does. */
export function sizeRanker(values: string[], systems: SizeSystem[]): ((value: string) => number) | null {
  const wanted = Array.from(new Set(values.map(plain).filter(Boolean)));
  if (wanted.length < 2) return null;
  for (const system of systems) {
    const rank = new Map<string, number>();
    system.order.forEach((size, i) => {
      rank.set(plain(size), i);
      for (const alias of system.writtenAs[size] ?? []) if (!rank.has(plain(alias))) rank.set(plain(alias), i);
    });
    if (wanted.every((v) => rank.has(v))) return (value: string) => rank.get(plain(value)) ?? Number.MAX_SAFE_INTEGER;
  }
  return null;
}

/** Variants sorted option by option: sized options in their system's order, the rest as first met. */
export function inSizeOrder<V>(variants: V[], valuesOf: (v: V) => Array<string | null>, systems: SizeSystem[]): V[] {
  if (systems.length === 0 || variants.length < 2) return variants;
  const width = Math.max(0, ...variants.map((v) => valuesOf(v).length));
  let out = [...variants];
  for (let i = width - 1; i >= 0; i--) {
    const values = out.map((v) => valuesOf(v)[i] ?? "");
    const ranked = sizeRanker(values, systems);
    const firstMet = new Map<string, number>();
    for (const v of variants) {
      const key = plain(valuesOf(v)[i] ?? "");
      if (!firstMet.has(key)) firstMet.set(key, firstMet.size);
    }
    const rankOf = (v: V) => (ranked ? ranked(valuesOf(v)[i] ?? "") : firstMet.get(plain(valuesOf(v)[i] ?? "")) ?? 0);
    out = out.map((v, at) => ({ v, at })).sort((a, b) => rankOf(a.v) - rankOf(b.v) || a.at - b.at).map((x) => x.v);
  }
  return out;
}
