/**
 * Building a ski package from a flat ski.
 *
 * A flat ski is one option — Length. The same ski sold as a package is three:
 *
 *   Length  ×  Binding Option  ×  Binding Fitting
 *
 * The bindings a shop packages with are its own list (Settings → Bindings for ski packages), and
 * a ski is packaged only with the ones somebody picked for it or named in an instruction; no
 * binding is chosen for a ski by default. A package's recommended retail is the ski's plus the
 * binding's, and mounting adds the shop's own charge to THAT, so a sale discounts the mount along
 * with everything else rather than bolting it on afterwards. The charges and the wording of the two
 * fittings are the shop's settings (terms.ts).
 */

import { money } from "../../adjust";
import { slugify } from "../../handle";
import type { GroupedProduct } from "../../grouping";
import { asShopWritesIt, productTitle, seasonTagFrom } from "../../titles";
import type { Listing } from "../../shop-memory";
import { COLOUR_WORDS } from "../../types";
import { isSystemBinding } from "./mount";
import { packageTerms } from "./terms";

/** The mounting charge for a package on this binding: the shop's drill or system charge, by what the binding is. */
export function mountFeeFor(binding: string): number {
  const t = packageTerms();
  return isSystemBinding(binding) ? t.systemMountFee : t.drillMountFee;
}

/** The two fittings as the shop words them, not-mounted first. */
export function fittings(): [string, string] {
  const t = packageTerms();
  return [t.fittingNoMount, t.fittingMount];
}

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
export function packageTitle(skiTitle: string, season: string, binding: BindingChoice | BindingChoice[]): string {
  const all = Array.isArray(binding) ? binding : [binding];
  const base = skiTitle.trim().replace(/\s+/g, " ");
  const withSeason = season && !new RegExp(`\\b${season}\\b`).test(base) ? `${base} ${season}` : base;
  // A package offering several bindings is named for none of them, as the catalogue's older ones are.
  if (all.length !== 1) return `${withSeason} inc Binding Package`;
  const name = all[0].shortName ?? all[0].label.replace(/\s*-\s*\w+$/, "");
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

  const [noMount, mount] = fittings();
  const variants: PackageVariant[] = [];
  for (const { length, rrp, barcode, cost = null, quantity = null } of ski.lengths) {
    const code = (barcode ?? "").trim();
    for (const binding of chosen) {
      const base = rrp === null ? null : money(rrp + binding.rrp);
      const both = cost === null || cost === undefined || binding.cost === null || binding.cost === undefined ? null : money(cost + binding.cost);
      variants.push({ length, bindingOption: binding.label, bindingFitting: noMount, rrp: base, cost: both, quantity, barcode: code });
      variants.push({ length, bindingOption: binding.label, bindingFitting: mount, rrp: base === null ? null : money(base + mountFeeFor(binding.label)), cost: both, quantity, barcode: code });
    }
  }

  // "ski packages" marks a package. The flat ski's own tags come with it, because a package is the
  // same ski on the same shelves.
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

/** How a binding is found in a supplier's price list. */
export interface BindingSpec {
  label: string;
  shortName: string;
  model: RegExp;
  colour: RegExp;
  /** A price the shop has fixed for this binding, which stands in place of any supplier's list. */
  fixed?: { rrp: number; cost: number };
}

/**
 * The binding's price and cost, read off the supplier's own price list.
 *
 * A supplier's list usually prices every width of a binding the same, so any row of the right
 * model and colour gives the price. Where two rows of the model disagree on price, none is taken:
 * a guessed binding price is a wrong package price.
 */
export function bindingFrom(spec: BindingSpec, priceList: Array<{ title: string; colour?: string; rrp: number | null; costPrice: number | null }>): BindingChoice | null {
  if (spec.fixed) return { label: spec.label, shortName: spec.shortName, rrp: spec.fixed.rrp, cost: spec.fixed.cost };
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
  // Any of the shop's ski Types: "Skis", "Mens Skis", "Freeride & Powder Skis" — a model the shop
  // listed before keeps the Type it was filed under. Not cross-country skis (asked 2026-10-20: a
  // Bent 100 had no binding picker while the Bent 110 beside it had one).
  return /\bskis?$/i.test(g.productType.trim()) && !/cross[- ]?country|\bnordic\b/i.test(g.productType) && !/\binc\b|\bpackage\b|\bsystem\b/i.test(g.title) && !g.tags.includes("ski packages");
}

/** The bindings someone asked for, by who the skis are for. See BatchDirectives.packageBindings. */
export type ChosenBindings = Partial<Record<"mens" | "womens" | "kids", BindingSpec>>;

/**
 * A binding as somebody named it — "the Griffon", "Marker Squire", "Look Pivot 12", "Squire black" —
 * as something to find on the price list: its model words, and the colour where one is named.
 */
export function specFromName(name: string): BindingSpec | null {
  const n = name.trim();
  if (!n) return null;
  const bySwatch = specFromLabel(n);
  if (bySwatch) return bySwatch;
  const colour = n.toUpperCase().split(/[^A-Z]+/).find((w) => COLOUR_WORDS.has(w));
  const words = n.split(/\s+/).filter((w) => !/^(marker|look|tyrolia|salomon|atomic|rossignol|the|binding|bindings)$/i.test(w) && w.toUpperCase() !== colour);
  if (words.length === 0) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shortName = words.join(" ");
  return {
    label: colour ? `${shortName} - ${colour.charAt(0) + colour.slice(1).toLowerCase()}` : n,
    shortName,
    model: new RegExp(`\\b${words.map(esc).join("\\s*")}\\b`, "i"),
    colour: colour ? new RegExp(`^\\s*${colour}\\s*$`, "i") : /./,
  };
}

export function packageProducts(
  products: GroupedProduct[],
  priceList: Array<{ title: string; colour?: string; rrp: number | null; costPrice: number | null }>,
  listings: Listing[] = [],
  chosen: ChosenBindings = {},
  /**
   * The bindings somebody picked for this ski from the shop's binding list (asked 2026-10-20): one
   * Binding Option each. An empty pick or none at all is no package.
   */
  picked?: (ski: GroupedProduct) => BindingChoice[] | undefined,
  /** The shop's own binding list: where a named binding is on it, its price and cost come from it. */
  shopList: Array<{ name: string; rrp: number; cost: number | null }> = [],
): { packages: GroupedProduct[]; skipped: PackageSkip[] } {
  const packages: GroupedProduct[] = [];
  const skipped: PackageSkip[] = [];
  void listings;
  for (const g of products) {
    if (!isFlatSki(g)) continue;
    const season = seasonTagFrom(g.tags);
    const flatTitle = productTitle(g.title, season);
    const picks = picked?.(g);
    if (picks && picks.length === 0) continue;
    if (picks && picks.length > 0) { packages.push(packageOf(g, flatTitle, season ?? "", picks)); continue; }
    // No binding is chosen for a ski on its own: a ski is packaged only with the bindings somebody
    // picked for it, or that an instruction named for skis like it. Unpicked, it has no package.
    const gender = g.tags.find((t) => /^(mens|womens|kids)$/.test(t)) ?? "";
    const who = gender === "womens" ? "womens" : gender === "kids" || /\b(kid|kids|junior|jr|youth|girls?|boys?)\b/i.test(flatTitle) ? "kids" : "mens";
    const spec = chosen[who];
    if (!spec) continue;
    const listed = shopList.find((e) => new RegExp(`^${spec.shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(e.name.trim()));
    const binding = listed ? { label: spec.label, shortName: spec.shortName, rrp: listed.rrp, cost: listed.cost } : bindingFrom(spec, priceList);
    if (!binding) { skipped.push({ title: flatTitle, reason: `no ${spec.label} with one price on the supplier's price list` }); continue; }
    packages.push(packageOf(g, flatTitle, season ?? "", [binding]));
  }
  return { packages, skipped };
}

/** A flat ski as its package on these bindings: every length × every binding × both fittings. */
function packageOf(g: GroupedProduct, flatTitle: string, season: string, bindings: BindingChoice[]): GroupedProduct {
  const title = packageTitle(flatTitle, season, bindings);
  const variants = g.variants.flatMap((v) => {
    const length = v.item.length || v.item.size || v.option1Value || "";
    return bindings.flatMap((binding) => {
      const rrp = v.item.rrp === null ? null : money(v.item.rrp + binding.rrp);
      const cost = v.item.costPrice === null || binding.cost === null || binding.cost === undefined ? null : money(v.item.costPrice + binding.cost);
      const [noMount, mount] = fittings();
      return [noMount, mount].map((fitting) => ({
        ...v,
        item: { ...v.item, rrp: rrp === null ? null : fitting === mount ? money(rrp + mountFeeFor(binding.label)) : rrp, costPrice: cost },
        option1Value: length,
        option2Value: binding.label,
        option3Value: fitting,
      }));
    });
  });
  const tags = [...g.tags];
  for (const t of ["ski packages", "ski", "skis"]) if (!tags.includes(t)) tags.push(t);
  return {
    ...g,
    key: `${g.key}|package`,
    handle: slugify(title),
    title,
    tags,
    option1Name: "Length",
    option2Name: "Binding Option",
    option3Name: "Binding Fitting",
    variants,
  };
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
 * An order of skis often carries the binding the packages are made with beside them. Built as a
 * product of its own it becomes a listing nobody asked for, while the packages it was bought for go
 * on without it. So a binding the packages use — one on the shop's binding list, or one an
 * instruction named — ordered in the same delivery as skis, is package stock and is not listed.
 */
export function isPackageBinding(
  p: { title: string; category?: string; productType: string; variants: Array<{ item: { colour: string } }> },
  packageBindings: Array<BindingSpec | undefined> = [],
): boolean {
  if (!/binding/i.test(p.productType) && p.category !== "bindings") return false;
  const colour = p.variants.map((v) => v.item.colour.trim()).find(Boolean) ?? "";
  return packageBindings.filter((e): e is BindingSpec => Boolean(e)).some((spec) => spec.model.test(p.title) && spec.colour.test(colour || p.title));
}

/** The shop's binding list as specs, for telling package stock from a binding to sell. */
export function specsOfList(entries: Array<{ name: string }>): BindingSpec[] {
  return entries.map((e) => specFromName(e.name)).filter((s): s is BindingSpec => Boolean(s));
}
