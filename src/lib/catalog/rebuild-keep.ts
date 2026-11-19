/**
 * What a product had gathered since it was built, kept through a rebuild.
 *
 * Column mapping rebuilds a batch's products from the order lines — every product deleted and made
 * again — so that a changed mapping or instruction takes effect. What came from the order comes
 * back that way. What did not was lost with it: a product link somebody pasted, the description and
 * pictures that link's page gave, a web lookup's copy, and pictures somebody added by hand. The shop
 * pasted links, went back to Column mapping, exported, and the export had none of it (2026-10-16).
 *
 * So before the rebuild each product's gathered things are noted, and the product the rebuild makes
 * in its place — the same handle, or failing that the same name — gets them back. The order still
 * decides prices, sizes and quantities; this only returns what the order never held.
 */

import { isPlaceholderBody } from "./body";
import { productTitle } from "./titles";

/** Statuses whose description a lookup or a page wrote, not the order and not a person. */
const MACHINE_FILLED = ["FOUND", "UNSURE", "PAGE", "PAGE_UNSURE", "RELINKED"];
/** Pictures that did not come from the order or the library, and so the rebuild would not find again. */
const GATHERED_PICTURES = ["PAGE", "MANUAL"];

export interface Gathered {
  handle: string;
  title: string;
  tags: string;
  bodyHtml: string;
  lookupStatus: string;
  lookupSource: string;
  lookupAt: Date | null;
  /** Each colour's own page: JSON, as the product keeps it. */
  colourLinks?: string;
  /** A picture tied to a variant says which colour it is of, since the variant is rebuilt too. */
  images: Array<{ url: string; source: string; altText: string; position: number; validated: boolean; colour?: string }>;
}

export interface Kept {
  title?: string;
  bodyHtml?: string;
  lookupStatus: string;
  lookupSource: string;
  lookupAt: Date | null;
  colourLinks?: string;
  images: Array<{ url: string; source: string; altText: string; validated: boolean; colour?: string }>;
}

const yearOf = (tags: string): string | null => tags.split(",").map((t) => t.trim()).find((t) => /^20\d{2}$/.test(t)) ?? null;
/** A title without the season the build put after it, to compare names by. */
const bareName = (title: string, tags: string): string => {
  const year = yearOf(tags);
  const t = title.trim().replace(/\s+/g, " ");
  return (year && t.endsWith(` ${year}`) ? t.slice(0, -year.length - 1) : t).toLowerCase();
};

/** Whether a product had gathered anything a rebuild would lose. */
function hasGathered(p: Gathered): boolean {
  return p.lookupStatus !== "NONE" || p.lookupSource.trim() !== "" || (p.colourLinks ?? "[]") !== "[]" || p.images.some((i) => GATHERED_PICTURES.includes(i.source));
}

/**
 * The products as they were, ready to be matched to the ones the rebuild makes. Each old product
 * is given back once: to the new product with its handle, or else to the first with its name.
 */
export function keeper(before: Gathered[]): (built: { handle: string; title: string; tags: string }) => Kept | null {
  const left = before.filter(hasGathered);
  return (built) => {
    let at = left.findIndex((p) => p.handle === built.handle);
    if (at < 0) at = left.findIndex((p) => bareName(p.title, p.tags) === bareName(built.title, built.tags));
    if (at < 0) return null;
    const [old] = left.splice(at, 1);
    const kept: Kept = {
      lookupStatus: old.lookupStatus,
      lookupSource: old.lookupSource,
      lookupAt: old.lookupAt,
      ...(old.colourLinks && old.colourLinks !== "[]" ? { colourLinks: old.colourLinks } : {}),
      images: [...old.images].sort((a, b) => a.position - b.position).filter((i) => GATHERED_PICTURES.includes(i.source)).map(({ url, source, altText, validated, colour }) => ({ url, source, altText, validated, ...(colour ? { colour } : {}) })),
    };
    // A description the page or a lookup wrote; the order's own, or one a person wrote, comes back from the order.
    if (MACHINE_FILLED.includes(old.lookupStatus) && !isPlaceholderBody(old.bodyHtml)) kept.bodyHtml = old.bodyHtml;
    // The name the supplier's page gives it, with this build's season after it.
    if (old.lookupStatus === "PAGE" && old.title.trim()) {
      const oldYear = yearOf(old.tags);
      const name = oldYear && old.title.trim().endsWith(` ${oldYear}`) ? old.title.trim().slice(0, -oldYear.length - 1) : old.title.trim();
      kept.title = productTitle(name, yearOf(built.tags));
    }
    return kept;
  };
}
