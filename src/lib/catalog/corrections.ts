/**
 * What a person corrected on the review grid, kept as a rule from that moment on.
 *
 * Fixing a thing once should be enough. Until now a renamed option or a changed Type stayed on
 * the one product it was fixed on, and the next build made the same mistake for someone to fix
 * again. Each correction is kept here and the build applies it:
 *
 *   - an option renamed on a kind of product ("Option" to "Volume" on Hiking Packs) is that kind's
 *     option name from then on;
 *   - a Type changed on a brand's product ("Accessories" to "Climbing Accessories" on a Black
 *     Diamond line) is that brand's Type from then on, and every brand's once the same correction
 *     has been made on two brands.
 *
 * Corrections are the shop's own and stay in its copy. How often each is made is kept, so the ones
 * many shops make can be offered to a trade pack later, after a person has looked at them.
 */

export interface Correction {
  kind: "option-name" | "product-type";
  /** The kind of product an option name belongs to; empty for a Type. */
  scope: string;
  from: string;
  to: string;
  /** The brands it was made on. */
  brands: string[];
  count: number;
  /** When it was last made, as an ISO date. */
  at: string;
}

export const CORRECTIONS_KEY = "shop.corrections";
const KEEP = 500;

let active: Correction[] = [];

/** Put the shop's corrections in force for this process. Called when the shop's conventions load. */
export function activateCorrections(list: Correction[]): void {
  active = list;
}

export function activeCorrections(): Correction[] {
  return active;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The list with one more correction in it: counted again where it was made before, the newest last. */
export function noteCorrection(list: Correction[], made: { kind: Correction["kind"]; scope: string; from: string; to: string; brand: string }, now = new Date()): Correction[] {
  const from = made.from.trim();
  const to = made.to.trim();
  if (!from || !to || same(from, to)) return list;
  // A correction made back the other way undoes the first rather than fighting it.
  const rest = list.filter((c) => !(c.kind === made.kind && same(c.scope, made.scope) && same(c.from, to) && same(c.to, from)));
  const at = rest.findIndex((c) => c.kind === made.kind && same(c.scope, made.scope) && same(c.from, from));
  const brand = made.brand.trim();
  if (at >= 0) {
    const c = rest[at];
    const brands = brand && !c.brands.some((b) => same(b, brand)) ? [...c.brands, brand] : c.brands;
    const next = { ...c, to, brands, count: same(c.to, to) ? c.count + 1 : 1, at: now.toISOString() };
    return [...rest.slice(0, at), ...rest.slice(at + 1), next].slice(-KEEP);
  }
  return [...rest, { kind: made.kind, scope: made.scope.trim(), from, to, brands: brand ? [brand] : [], count: 1, at: now.toISOString() }].slice(-KEEP);
}

/** An option's name on a kind of product, as the shop corrected it. */
export function correctedOptionName(productType: string, name: string, list: Correction[] = active): string {
  const c = list.find((x) => x.kind === "option-name" && same(x.scope, productType) && same(x.from, name));
  return c ? c.to : name;
}

/** A product's Type, as the shop corrected it for this brand, or for every brand once two have had it. */
export function correctedProductType(type: string, brand: string, list: Correction[] = active): string {
  const c = list.find((x) => x.kind === "product-type" && same(x.from, type) && (x.brands.some((b) => same(b, brand)) || x.brands.length >= 2));
  return c ? c.to : type;
}
