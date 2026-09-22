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
  /** For the title: "Marker Griffon". Falls back to the label. */
  shortName?: string;
}

export interface FlatSki {
  title: string;
  brand: string;
  season: string;
  tags: string[];
  /** One entry per length, with that length's own recommended retail and barcode. */
  lengths: Array<{ length: string; rrp: number | null; barcode?: string }>;
}

export interface PackageVariant {
  length: string;
  bindingOption: string;
  bindingFitting: string;
  /** Null when the ski or the binding has no recommended retail — never a guessed number. */
  rrp: number | null;
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
  for (const { length, rrp, barcode } of ski.lengths) {
    const code = (barcode ?? "").trim();
    for (const binding of chosen) {
      const base = rrp === null ? null : money(rrp + binding.rrp);
      variants.push({ length, bindingOption: binding.label, bindingFitting: FITTING_NO_MOUNT, rrp: base, barcode: code });
      variants.push({ length, bindingOption: binding.label, bindingFitting: FITTING_MOUNT, rrp: base === null ? null : money(base + MOUNT_FEE), barcode: code });
    }
  }

  // "ski packages" is how this shop tags one — 40 products carry it. The flat ski's own tags come
  // with it, because a package is the same ski on the same shelves.
  const tags = [...ski.tags];
  for (const t of ["ski packages", "ski", "skis"]) if (!tags.includes(t)) tags.push(t);

  return {
    title,
    handle: slugify(`${ski.brand} ${title}`.trim()),
    brand: ski.brand,
    tags,
    optionNames: ["Length", "Binding Option", "Binding Fitting"],
    variants,
  };
}
