/**
 * The shop's conventions for the variant columns: what a product weighs for shipping, and what a
 * ski or board sold with bindings costs and sells for.
 */

import { resolveType } from "./taxonomy";

/**
 * Shipping weight, in grams, as the shop records it.
 *
 * It is a band rather than a measurement — every ski is 2 kg and every snowboard 1 kg whatever it
 * actually weighs — so it is set from what the product is, not from the invoice. Everything else is
 * left at zero, which is what all 258 garments, 219 sleeping bags and 323 pairs of footwear carry.
 */
export const SKI_GRAMS = 2000;
export const SNOWBOARD_GRAMS = 1000;
export const WHEELED_BAG_GRAMS = 1000;

const WHEELED = /\bwheel(s|ed|ie)?\b|\broller\b/i;

export function defaultGrams(productType: string, describedAs = ""): number {
  const type = resolveType(productType) ?? productType.trim();
  const text = `${describedAs} ${type}`;

  if (type === "Skis") return SKI_GRAMS;
  if (type === "Snowboards") return SNOWBOARD_GRAMS;
  // A bag only earns a weight once it has wheels; the rest pack flat and ship as nothing.
  if (/\bbags?\b/i.test(text) && WHEELED.test(describedAs)) return WHEELED_BAG_GRAMS;
  return 0;
}

/**
 * What the shop charges to mount a binding on a ski — the whole difference between the two answers
 * to the fitting question, since it is the same SKU and the same stock with a workshop job attached.
 *
 * Set by the shop on 2026-10-20: a drill mount is $59 and a system binding (on its rail or plate)
 * $49, whether the binding came with the ski or the customer brings it.
 */
export const FLAT_SKI_MOUNTING_FEE = 59;
export const PACKAGE_MOUNTING_FEE = 59;
export const SYSTEM_MOUNTING_FEE = 49;

export function mountingFee({ withBindings = false, system = false } = {}): number {
  if (system) return SYSTEM_MOUNTING_FEE;
  return withBindings ? PACKAGE_MOUNTING_FEE : FLAT_SKI_MOUNTING_FEE;
}

export interface PackageParts {
  /** The ski or board's own recommended retail. */
  rrp: number;
  /** The binding's recommended retail, when one is sold on it. */
  bindingRrp?: number | null;
}

/**
 * What a ski or board sells for. A package is the two recommended retails added together — the
 * shop does not discount the pair — and mounting is added on top of that, not built into it.
 */
export function packagePrice(parts: PackageParts, { mounted = false } = {}): number {
  const withBindings = (parts.bindingRrp ?? 0) > 0;
  const base = round(parts.rrp + (parts.bindingRrp ?? 0));
  return mounted ? round(base + mountingFee({ withBindings })) : base;
}

/** And what it cost: the invoice price, plus the binding's when one is on it. */
export function packageCost(cost: number, bindingCost?: number | null): number {
  return round(cost + (bindingCost ?? 0));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
