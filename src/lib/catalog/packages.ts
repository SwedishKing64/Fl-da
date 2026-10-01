/**
 * Building a ski package from a flat ski.
 *
 * A flat ski is one option — Length. The same ski sold as a package is three, and the shape is not
 * negotiable because 191 of the 455 skis in this shop's catalogue already have it:
 *
 *   Length  ×  Binding Option  ×  Binding Fitting
 *
 * Every value below is the shop's own spelling, counted from that catalogue rather than invented:
 * "Marker Griffon - Black" is on 175 products, and the two fittings are "Do Not Mount My Bindings"
 * (657) and "Please Mount My Bindings" (619).
 *
 * The prices come from the same place. A package's recommended retail is the ski's plus the
 * binding's, and mounting adds a flat amount to THAT — $55 on 319 of the 673 pairs that state
 * both, which is the plurality by a distance. It matters that the mount charge goes on the
 * recommended retail and not on the sell price: the Blaze 94 2025 is 1724.99/1779.99 at full price
 * and 1207.49/1245.99 on sale, which is the same 70% applied to both, so the mount is discounted
 * along with everything else rather than bolted on afterwards.
 */

import { money } from "./adjust";
import { slugify } from "./handle";
import type { GroupedProduct } from "./grouping";
import { asShopWritesIt, productTitle, seasonTagFrom } from "./titles";
import { rememberedBinding, type Listing } from "./shop-memory";
import { COLOUR_WORDS } from "./types";

/** What the shop charges to mount a binding, before any discount. */
export const MOUNT_FEE = 55;

/** The two fittings, spelled as the catalogue spells them. Do-not-mount is always first. */
export const FITTING_NO_MOUNT = "Do Not Mount My Bindings";
export const FITTING_MOUNT = "Please Mount My Bindings";

export interface BindingChoice {
  /** As it should read in the Binding Option column, e.g. "Marker Griffon - Black". */
  label: string;
  /** Recommended retail of the binding on its own. */
  rrp: number;
  /** What the shop pays for the binding, added to the ski's cost. Null when the order does not say. */
  cost?: number | null;
  /** For the title: "Marker Griffon". Falls back to the label. */
  shortName?: string;
}

export interface FlatSki {
  title: string;
  brand: string;
  season: string;
  tags: string[];
  /** One entry per length, with that length's own recommended retail and barcode. */
  lengths: Array<{ length: string; rrp: number | null; barcode?: string; cost?: number | null; quantity?: number | null }>;
}

export interface PackageVariant {
  length: string;
  bindingOption: string;
  bindingFitting: string;
  /** Null when the ski or the binding has no recommended retail — never a guessed number. */
  rrp: number | null;
  /**
   * What the package costs the shop: the ski's cost plus the binding's. Mounting is labour, so it
   * adds nothing here — the M7 Mantra package costs 958.19 mounted or not (749.55 + 208.64).
   */
  cost: number | null;
  /** The ski's stock for this length: a package is the same ski, so it is the same count. */
  quantity: number | null;
  /**
   * The SKI's barcode for this length, on every variant of it.
   *
   * A package is the ski; the binding travels with it. So all four variants of a length — both
   * bindings, both fittings — carry the one barcode the ski has, and a binding's own barcode never
   * appears on a package. Their catalogue is unanimous: of 302 (package, length) pairs that carry
   * a barcode, every single one uses a single barcode across every binding and fitting, and 466 of
   * the 474 that can be matched back to the flat ski are that ski's own.
   */
  barcode: string;
}

export interface SkiPackage {
  title: string;
  handle: string;
  brand: string;
  tags: string[];
  optionNames: [string, string, string];
  variants: PackageVariant[];
}

/**
 * The package's name, which is also its handle.
 *
 * The catalogue writes two forms — "Blaze 94 2025 inc Binding Package" and the newer "Blaze 94
 * 2027 inc Marker Griffon Binding Package". The newer one is used: with more than one binding on
 * offer a name that does not say which is ambiguous the moment a second package exists.
 */
export function packageTitle(skiTitle: string, season: string, binding: BindingChoice): string {
  const name = binding.shortName ?? binding.label.replace(/\s*-\s*\w+$/, "");
  const base = skiTitle.trim().replace(/\s+/g, " ");
  const withSeason = season && !new RegExp(`\\b${season}\\b`).test(base) ? `${base} ${season}` : base;
  return `${withSeason} inc ${name} Binding Package`;
}

/**
 * Turn a flat ski into its package.
 *
 * Every length is crossed with every binding and both fittings, which is what the catalogue does —
 * the Blaze 94 2025 carries 2 lengths × 2 bindings × 2 fittings = 8 variants and no gaps.
 *
 * A length whose recommended retail is missing keeps a null price rather than inheriting another
 * length's. Lengths are not priced alike here — the Blaze 94 2025 is 1724.99 at 172 and 2469.99 at
 * 179 — so carrying one across would be a wrong price rather than a missing one, and this shop's
 * rule is that a price nobody quoted is not a price.
 */
export function buildPackage(ski: FlatSki, bindings: BindingChoice[]): SkiPackage {
  const chosen = bindings.filter((b) => b.label.trim());
  if (chosen.length === 0) throw new Error("A package needs at least one binding.");
  const title = packageTitle(ski.title, ski.season, chosen[0]);

  const variants: PackageVariant[] = [];
  for (const { length, rrp, barcode, cost = null, quantity = null } of ski.lengths) {
    const code = (barcode ?? "").trim();
    for (const binding of chosen) {
      const base = rrp === null ? null : money(rrp + binding.rrp);
      const both = cost === null || cost === undefined || binding.cost === null || binding.cost === undefined ? null : money(cost + binding.cost);
      variants.push({ length, bindingOption: binding.label, bindingFitting: FITTING_NO_MOUNT, rrp: base, cost: both, quantity, barcode: code });
      variants.push({ length, bindingOption: binding.label, bindingFitting: FITTING_MOUNT, rrp: base === null ? null : money(base + MOUNT_FEE), cost: both, quantity, barcode: code });
    }
  }

  // "ski packages" is how this shop tags one — 40 products carry it. The flat ski's own tags come
  // with it, because a package is the same ski on the same shelves.
  const tags = [...ski.tags];
  for (const t of ["ski packages", "ski", "skis"]) if (!tags.includes(t)) tags.push(t);

  return {
    title,
    // The flat ski's handle with the package on the end — "m7-mantra-2027-inc-marker-griffon-
    // binding-package" — which is how every package in the shop is addressed. Never the brand.
    handle: slugify(title),
    brand: ski.brand,
    tags,
    optionNames: ["Length", "Binding Option", "Binding Fitting"],
    variants,
  };
}

/**
 * The binding a ski is packaged with, by who the ski is for.
 *
 * The shop's own choice, from its catalogue: men's and unisex skis go with the Marker Griffon in
 * black (59 packages), women's with the Marker Squire in white (30). A kids' ski takes a junior
 * binding the order has to name, so none is chosen for it here.
 */
export const DEFAULT_PACKAGE_BINDINGS: { mens: BindingSpec; womens: BindingSpec } = {
  mens: { label: "Marker Griffon - Black", shortName: "Marker Griffon", model: /\bGRIFFON\s*13\s*MN\b/i, colour: /\bBLACK\b/i },
  womens: { label: "Marker Squire - White", shortName: "Marker Squire", model: /\bSQUIRE\s*11\b/i, colour: /\bWHITE\b/i },
};

/** How a binding is found in a supplier's price list. */
export interface BindingSpec {
  label: string;
  shortName: string;
  model: RegExp;
  colour: RegExp;
}

/** Which of the defaults a ski takes, from its gender and name. Null for a kids' ski. */
export function bindingSpecFor(gender: string, title: string): BindingSpec | null {
  const g = `${gender} ${title}`.toLowerCase();
  if (/\b(kid|kids|junior|jr|youth|girls?|boys?)\b/.test(g)) return null;
  if (/\b(women|womens|women's|ladies|w)\b/.test(g)) return DEFAULT_PACKAGE_BINDINGS.womens;
  return DEFAULT_PACKAGE_BINDINGS.mens;
}

/**
 * The binding's price and cost, read off the supplier's own price list.
 *
 * Their Marker tab prices every width of a binding the same — the Griffon 13 MN is 459 at 90, 100,
 * 110 and 120mm — so any row of the right model and colour gives the price. Where two rows of the
 * model disagree on price, none is taken: a guessed binding price is a wrong package price.
 */
export function bindingFrom(spec: BindingSpec, priceList: Array<{ title: string; colour?: string; rrp: number | null; costPrice: number | null }>): BindingChoice | null {
  // The colour column where the list has one; the name only where it does not.
  const rows = priceList.filter((r) => spec.model.test(r.title) && spec.colour.test((r.colour ?? "").trim() || r.title) && r.rrp !== null && r.rrp > 0);
  if (rows.length === 0) return null;
  // To the cent: the order form's 208.6363… and the same figure written 208.64 are one price.
  const prices = new Set(rows.map((r) => money(r.rrp!)));
  if (prices.size > 1) return null;
  const costs = new Set(rows.map((r) => r.costPrice).filter((c): c is number => c !== null && c > 0).map(money));
  return { label: spec.label, shortName: spec.shortName, rrp: money(rows[0].rrp!), cost: costs.size === 1 ? [...costs][0] : null };
}

/** Why a ski was not given a package, for the page to say. */
export interface PackageSkip { title: string; reason: string }

/**
 * A ski named with the binding it is sold on: "HERO FIS GS FAC SPX15", "HERO GS PRO R21 NX7".
 *
 * Rossignol's race and junior skis arrive from the supplier already mounted with their binding, so
 * the binding is on the end of the ski's name — and it IS a binding, not part of the model. The shop
 * lists a ski sold with a binding as a package, and writes it the same way every time: the ski, its
 * season, "inc", the binding, "Binding Package" ("Arcade 82 2027 inc Xpress 11 Binding Package").
 * Left as "Hero Fis GS Fac Spx15 2026" it read as a model called Spx15, with no sign there was a
 * binding in the box.
 *
 * Only the bindings whose names say what they are — SPX, NX and Xpress with their number — and only
 * at the end of the name, where a supplier puts it.
 */
const INTEGRATED_BINDING = /^(.*?\S)\s+(SPX|NX|XPRESS)\s?(\d{1,2})(?:\s+(GW|TCX))?\s*$/i;

export function integratedBinding(skiTitle: string, season: string): { title: string; binding: string } | null {
  const text = skiTitle.trim().replace(/\s+/g, " ");
  if (/\binc\b|\bpackage\b/i.test(text)) return null;
  const m = INTEGRATED_BINDING.exec(text);
  if (!m) return null;
  const maker = m[2].toUpperCase();
  const name = maker === "XPRESS" ? "Xpress" : maker;
  const binding = `${name} ${m[3]}${m[4] ? ` ${m[4].toUpperCase()}` : ""}`;
  const base = asShopWritesIt(m[1]);
  const withSeason = season && !new RegExp(`\\b${season}\\b`).test(base) ? `${base} ${season}` : base;
  return { title: `${withSeason} inc ${binding} Binding Package`, binding };
}

/** Is this grouped product a flat ski — the thing a package is built from? */
export function isFlatSki(g: { productType: string; title: string; tags: string[] }): boolean {
  return /^skis?$/i.test(g.productType.trim()) && !/\binc\b|\bpackage\b|\bsystem\b/i.test(g.title) && !g.tags.includes("ski packages");
}

/**
 * The binding package of every flat ski in a delivery, alongside the flat ski itself.
 *
 * The shop sells each of its skis twice: "M7 Mantra 2027", the ski on its own, and "M7 Mantra 2027
 * inc Marker Griffon Binding Package" — the same ski, the same stock, with a binding added to the
 * price and to the cost, and the choice of having it mounted for $55. Men's skis go with the Griffon
 * in black and women's with the Squire in white (see DEFAULT_PACKAGE_BINDINGS); the binding's price
 * and cost are read off the supplier's own price list, never assumed.
 *
 * Each package is written in the product shape the rest of the build already uses, so it goes
 * through the same writer as the flat ski: its variants are copies of the flat ski's line items
 * with the package's price and cost on them.
 */
/** The bindings someone asked for, by who the skis are for. See BatchDirectives.packageBindings. */
export type ChosenBindings = Partial<Record<"mens" | "womens" | "kids", BindingSpec>>;

/**
 * A binding as somebody named it — "the Griffon", "Marker Squire", "Look Pivot 12" — as something to
 * find on the price list. The shop's own defaults are used where the name is one of theirs, so "the
 * Griffon" is the Griffon 13 MN in black and not every Griffon on the Marker tab.
 */
export function specFromName(name: string): BindingSpec | null {
  const n = name.trim();
  if (!n) return null;
  // "Squire black": the shop's Squire, in the colour asked for rather than its usual white.
  const colour = n.toUpperCase().split(/[^A-Z]+/).find((w) => COLOUR_WORDS.has(w));
  for (const spec of [DEFAULT_PACKAGE_BINDINGS.mens, DEFAULT_PACKAGE_BINDINGS.womens]) {
    const word = spec.shortName.replace(/^marker\s+/i, "");
    if (!new RegExp(`\\b${word}\\b`, "i").test(n)) continue;
    if (!colour) return spec;
    const named = colour.charAt(0) + colour.slice(1).toLowerCase();
    return { ...spec, label: `${spec.shortName} - ${named}`, colour: new RegExp(`^\\s*${colour}\\s*$`, "i") };
  }
  const bySwatch = specFromLabel(n);
  if (bySwatch) return bySwatch;
  const words = n.split(/\s+/).filter((w) => !/^(marker|look|tyrolia|salomon|atomic|rossignol|the|binding|bindings)$/i.test(w));
  if (words.length === 0) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { label: n, shortName: n, model: new RegExp(`\\b${words.map(esc).join("\\s*")}\\b`, "i"), colour: /./ };
}

export function packageProducts(
  products: GroupedProduct[],
  priceList: Array<{ title: string; colour?: string; rrp: number | null; costPrice: number | null }>,
  listings: Listing[] = [],
  chosen: ChosenBindings = {},
): { packages: GroupedProduct[]; skipped: PackageSkip[] } {
  const packages: GroupedProduct[] = [];
  const skipped: PackageSkip[] = [];
  for (const g of products) {
    if (!isFlatSki(g)) continue;
    const season = seasonTagFrom(g.tags);
    const flatTitle = productTitle(g.title, season);
    const gender = g.tags.find((t) => /^(mens|womens|kids)$/.test(t)) ?? "";
    // A kids' ski takes the binding the shop packaged the model with last time, if it ever did.
    const who = gender === "womens" ? "womens" : gender === "kids" || !bindingSpecFor(gender, flatTitle) ? "kids" : "mens";
    const spec = chosen[who] ?? bindingSpecFor(gender, flatTitle) ?? specFromLabel(rememberedBinding({ title: g.title, brand: g.brand }, listings));
    if (!spec) { skipped.push({ title: flatTitle, reason: "a kids' ski takes a junior binding, and neither the order nor the shop's earlier packages of it say which" }); continue; }
    const binding = bindingFrom(spec, priceList);
    if (!binding) { skipped.push({ title: flatTitle, reason: `no ${spec.label} with one price on the supplier's price list` }); continue; }
    const title = packageTitle(flatTitle, season ?? "", binding);
    const variants = g.variants.flatMap((v) => {
      const length = v.item.length || v.item.size || v.option1Value || "";
      const rrp = v.item.rrp === null ? null : money(v.item.rrp + binding.rrp);
      const cost = v.item.costPrice === null || binding.cost === null || binding.cost === undefined ? null : money(v.item.costPrice + binding.cost);
      return [FITTING_NO_MOUNT, FITTING_MOUNT].map((fitting) => ({
        ...v,
        item: { ...v.item, rrp: rrp === null ? null : fitting === FITTING_MOUNT ? money(rrp + MOUNT_FEE) : rrp, costPrice: cost },
        option1Value: length,
        option2Value: binding.label,
        option3Value: fitting,
      }));
    });
    const tags = [...g.tags];
    for (const t of ["ski packages", "ski", "skis"]) if (!tags.includes(t)) tags.push(t);
    packages.push({
      ...g,
      key: `${g.key}|package`,
      handle: slugify(title),
      title,
      tags,
      option1Name: "Length",
      option2Name: "Binding Option",
      option3Name: "Binding Fitting",
      variants,
    });
  }
  return { packages, skipped };
}

/**
 * A binding named the way a package's Binding Option names it — "Marker Squire - Black" — as
 * something to find on a price list: the model words, and exactly that colour.
 */
export function specFromLabel(label: string): BindingSpec | null {
  const m = /^(.*?)\s*-\s*([A-Za-z /]+)$/.exec(label.trim());
  if (!m) return null;
  const words = m[1].split(/\s+/).filter((w) => !/^(marker|look|tyrolia|salomon|atomic|rossignol)$/i.test(w));
  if (words.length === 0) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    label: label.trim(),
    shortName: m[1].trim(),
    model: new RegExp(`\\b${words.map(esc).join("\\s*")}\\b`, "i"),
    colour: new RegExp(`^\\s*${esc(m[2].trim())}\\s*$`, "i"),
  };
}

/**
 * A binding on the order that is there to go on the skis, not to be sold on its own.
 *
 * Their Völkl order has five Marker Griffon 13 MN in black beside the skis: the binding every men's
 * package is made with. Built as a product of its own it became a "Griffon 13 MN" listing nobody
 * asked for, while the packages it was bought for went on without it. So a binding the packages use
 * (the Griffon in black, the Squire in white, or one a package here was built with), ordered in the
 * same delivery as skis, is package stock and is not listed.
 */
export function isPackageBinding(
  p: { title: string; category?: string; productType: string; variants: Array<{ item: { colour: string } }> },
  extra: Array<BindingSpec | undefined> = [],
): boolean {
  if (!/binding/i.test(p.productType) && p.category !== "bindings") return false;
  const colour = p.variants.map((v) => v.item.colour.trim()).find(Boolean) ?? "";
  return [DEFAULT_PACKAGE_BINDINGS.mens, DEFAULT_PACKAGE_BINDINGS.womens, ...extra.filter((e): e is BindingSpec => Boolean(e))].some((spec) => spec.model.test(p.title) && spec.colour.test(colour || p.title));
}
