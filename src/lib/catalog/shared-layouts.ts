/**
 * A supplier's file layout, shared between shops: the second shop to buy from a supplier does not
 * teach Flöda its columns again.
 *
 * What is shared is the structure and nothing else: the file's column headings, and which field each
 * one was mapped to by a shop that confirmed it. Never a value from a file, never a price, never which
 * shop it came from. The layouts are kept on Flöda's own deployment, which copies already talk to
 * with their licence key; a shop can stop sharing in Settings and still receive.
 */

import { CANONICAL_KEYS } from "./types";
import type { Mapping } from "./mapping";

export interface LayoutVariant {
  mappings: Mapping;
  /** The clients that taught it, by id; kept only on Flöda's deployment, never sent to a copy. */
  contributors: string[];
}

/** A shared layout as a copy receives it. */
export interface SharedLayoutAnswer {
  mappings: Mapping;
  /** How many shops taught this reading of the layout. */
  shops: number;
}

const FIELDS = new Set<string>(CANONICAL_KEYS as string[]);
const MAX_HEADERS = 200;

/** The headings of a file that may leave a shop, in order: both sides name a layout by these. */
export function shareableHeaders(headers: string[]): string[] {
  return headers.map((h) => h.trim()).filter((h) => h.length > 0 && h.length <= 80 && !/^[\d\s$€£.,%-]+$/.test(h)).slice(0, MAX_HEADERS);
}

/**
 * Only what may leave a shop: headings no longer than a heading is, each mapped to a field Flöda
 * knows or to nothing. A heading that holds a value — a long cell, a number that could be a price —
 * is dropped rather than shared.
 */
export function shareable(headers: string[], mappings: Mapping): { headers: string[]; mappings: Mapping } | null {
  const kept = shareableHeaders(headers);
  if (kept.length < 2) return null;
  const out: Mapping = {};
  for (const h of kept) {
    const field = mappings[h];
    out[h] = field && FIELDS.has(field) ? field : "";
  }
  return Object.values(out).some(Boolean) ? { headers: kept, mappings: out } : null;
}

const sameMapping = (a: Mapping, b: Mapping) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? "") === (b[k] ?? ""));
};

/** The variants with one more shop's reading: counted with an identical reading, or added as its own. */
export function addReading(variants: LayoutVariant[], mappings: Mapping, client: string): LayoutVariant[] {
  const without = variants.map((v) => ({ ...v, contributors: v.contributors.filter((c) => c !== client) })).filter((v) => v.contributors.length > 0);
  const at = without.findIndex((v) => sameMapping(v.mappings, mappings));
  if (at >= 0) return without.map((v, i) => (i === at ? { ...v, contributors: [...v.contributors, client] } : v));
  return [...without, { mappings, contributors: [client] }].slice(-20);
}

/** The reading most shops agree on, for a copy that is not one of them; null where it taught the only one. */
export function bestReading(variants: LayoutVariant[], asking: string): SharedLayoutAnswer | null {
  const others = variants
    .map((v) => ({ ...v, others: v.contributors.filter((c) => c !== asking).length }))
    .filter((v) => v.others > 0)
    .sort((a, b) => b.contributors.length - a.contributors.length);
  return others[0] ? { mappings: others[0].mappings, shops: others[0].others } : null;
}
