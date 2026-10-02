/**
 * A model's lines belong together, and the shop knowing one of them places the rest.
 *
 * An order carries last season's colourways of a model next to this season's new ones. The
 * shop's listing already has the EANs of the old colourways, so those lines are placed on it by
 * barcode; the new colourway's EAN is on no listing yet, and left to itself it goes out as a
 * second product under the supplier's shorthand — "Cartel X 2027" beside "Men's Cartel X Re:Flex
 * Snowboard Bindings 2027". But it is the same model on the same order sheet, named the same way
 * by the supplier, for the same audience: it belongs on the listing its siblings were placed on.
 *
 * Only an unambiguous model spreads. Where the supplier's one name sits on two listings — the
 * shop sells "Step On" as a men's and a women's product, or a Re:Flex and an EST — the siblings
 * disagree and nothing is decided here; the name join still gets its turn.
 */

import type { CanonicalLineItem } from "./types";
import { audience } from "./grouping";
import { normKey } from "./specs";

/** The supplier's name for a model, for one audience — what makes two order lines siblings. */
export function siblingKey(line: CanonicalLineItem): string {
  const name = normKey(line.title);
  return name ? `${name}|${audience(line.gender)}` : "";
}

/**
 * The lines not yet placed whose siblings all sit on one listing, each with that listing's handle.
 * `placed` is line index → handle of the listing it was placed on (by EAN).
 */
export function siblingsOfPlaced(lines: CanonicalLineItem[], placed: Map<number, string>): Map<number, string> {
  const handlesByKey = new Map<string, Set<string>>();
  for (const [k, handle] of placed) {
    const key = siblingKey(lines[k]);
    if (key) handlesByKey.set(key, new Set([...(handlesByKey.get(key) ?? []), handle]));
  }
  const out = new Map<number, string>();
  lines.forEach((line, k) => {
    if (placed.has(k)) return;
    const handles = handlesByKey.get(siblingKey(line));
    if (handles?.size === 1) out.set(k, [...handles][0]);
  });
  return out;
}
