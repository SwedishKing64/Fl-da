/**
 * What a product's variants are sold by: the option names, their order, and the values that are the
 * shop's to set rather than the supplier's.
 *
 * Read out of 705 products in the shop's own exports. Three things decide it. What the product is —
 * a ski is sold by length, a jacket by colour and size, a sleeping bag by size, loft and which side
 * the zip is on. Whether it is sold with bindings, which adds the binding itself and the question of
 * who mounts it. And whether anything varies at all: 220 of the 705 have no variants, and Shopify
 * spells that Title / Default Title.
 */

import { packKnowledge, resolveType } from "./taxonomy";

/** Shopify's own spelling for a product with a single variant. */
export const NO_VARIANT_OPTION = { name: "Title", value: "Default Title" } as const;

/**
 * The question asked of anyone buying a ski with bindings, and the shop's answer sheet. It is never
 * on a supplier invoice — it is a service the shop offers — so the importer adds it.
 *
 * A third value exists for skis whose bindings come on a rail rather than being drilled, and it
 * replaces the ordinary mount rather than joining it.
 */
export const BINDING_FITTING = "Binding Fitting";
export const BINDING_FITTING_VALUES = ["Do Not Mount My Bindings", "Please Mount My Bindings"] as const;
export const SYSTEM_FITTING_VALUES = ["Do Not Mount My Bindings", "Please Mount My System Bindings"] as const;

export function bindingFittingValues(systemBindings = false): readonly string[] {
  return systemBindings ? SYSTEM_FITTING_VALUES : BINDING_FITTING_VALUES;
}

/**
 * Names the catalogue holds in more than one spelling. The shop is Australian and writes Colour;
 * eight rows say Color. Seven sleeping bags ask for "Zip Size" when every value under it is Left or
 * Right, so it is the same question as Zip Side with a letter out of place.
 */
const NAME_DRIFT: Record<string, string> = {
  color: "Colour",
  "zip size": "Zip Side",
  "binding colour": "Binding Option",
};

export function normaliseOptionName(name: string): string {
  const value = name.trim();
  return NAME_DRIFT[value.toLowerCase()] ?? value;
}

/** The one option value in the catalogue with a letter out of place, on three products. */
const VALUE_DRIFT: Record<string, string> = {
  "do not mouny my bindings": "Do Not Mount My Bindings",
};

export function normaliseOptionValue(value: string): string {
  const trimmed = value.trim();
  return VALUE_DRIFT[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * A letter size written out as the shop writes it: Small, Medium, Large, Extra Large, 2X Large.
 *
 * The catalogue says so itself — 100 variants read "Medium" to 22 that read "M", 85 "Large" to 18
 * "L", 49 "Small" to 18 "S" — and the few letters are the ones that came in off a supplier's sheet.
 * Only a bare letter size is touched: a number, a combined "S/M", a sock's "SM" and a name a
 * person wrote stay as they are. Matching is unaffected, since a size is compared by what it
 * means, not how it is spelled (see sameSizeText).
 */
const SIZE_WORDS: Record<string, string> = {
  XXS: "2X Small", "2XS": "2X Small", XS: "Extra Small", S: "Small", M: "Medium", L: "Large",
  XL: "Extra Large", XXL: "2X Large", "2XL": "2X Large", XXXL: "3X Large", "3XL": "3X Large", "4XL": "4X Large",
};
export function writeOutSize(value: string): string {
  const key = value.trim().toUpperCase().replace(/\s+/g, "");
  return SIZE_WORDS[key] ?? value.trim();
}

export interface OptionContext {
  /** Sold with a binding on it, which makes the binding an option and raises who mounts it. */
  withBindings?: boolean;
  /** The bindings sit on a rail, so the mounting answer is the system one. */
  systemBindings?: boolean;
  /** Offer to mount bindings bought separately, on a ski sold bare. */
  offerFitting?: boolean;
}

/**
 * The option names a product of this Type is sold by, most important first.
 *
 * This is a preference, not a guarantee: an option nobody varies is dropped before it is written,
 * because a single-valued option is noise on the page and a duplicate combination in the file.
 */
export function optionPlanFor(type: string, context: OptionContext = {}): string[] {
  const resolved = resolveType(type) ?? type.trim();

  if (resolved === "Skis") {
    if (context.withBindings) return ["Length", "Binding Option", BINDING_FITTING];
    return context.offerFitting ? ["Length", BINDING_FITTING] : ["Length"];
  }

  // A board binding screws onto an insert pattern that is already there, so nobody is asked
  // whether to mount it — the board packages are sold by which binding and what size it is.
  if (resolved === "Snowboards") {
    return context.withBindings ? ["Length", "Binding Option", "Binding Size"] : ["Length"];
  }

  // A bag's length is its size, whichever word the supplier used; it comes before the zip side.
  if (resolved === "Sleeping Bags") return ["Size", "Length", "Loft", "Zip Side"];
  if (resolved === "Tents") return ["Add Footprint (recommended)"];
  if (resolved === "Hydration") return ["Colour", "Volume"];

  // The order the shop's trade pack gives this kind: a tyre by size then casing, a rotor by size then mount.
  const known = packKnowledge()?.kinds.find((k) => k.kind.toLowerCase() === resolved.toLowerCase());
  if (known?.optionOrder.length) return known.optionOrder;

  // Everything else the shop sells by colour and size, in that order — clothing, footwear, boots,
  // bindings, packs and the accessories that come in more than one.
  return ["Colour", "Size"];
}

/**
 * The plan narrowed to what this product actually varies by, and Shopify's single-variant spelling
 * when it varies by nothing. Names outside the plan follow it, so an attribute the shop has no
 * convention for is still carried rather than dropped.
 */
export function optionNamesFor(type: string, varying: string[], context: OptionContext = {}): string[] {
  const seen = new Set<string>();
  const wanted = varying.map(normaliseOptionName).filter((name) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (wanted.length === 0) return [NO_VARIANT_OPTION.name];

  const plan = optionPlanFor(type, context).map(normaliseOptionName);
  const ordered = plan.filter((name) => wanted.some((w) => w.toLowerCase() === name.toLowerCase()));
  const rest = wanted.filter((w) => !ordered.some((name) => name.toLowerCase() === w.toLowerCase()));
  return [...ordered, ...rest].slice(0, 3); // Shopify allows three
}
