/**
 * Shopify's Standard Product Taxonomy: the category every product should carry, which Shopify uses
 * for tax, for its own search and for marketplaces. Every kind of product a shop or a pack has must
 * resolve into it — a pack may name the category outright, and for the rest it is found by name.
 */

import { TAXONOMY_RELEASE, TAXONOMY_ROWS } from "./data/shopify-taxonomy";

export interface TaxonomyCategory {
  /** Shopify's id within the taxonomy: "sg-4-17-2-17". */
  id: string;
  name: string;
  /** "Sporting Goods > Outdoor Recreation > … > Tents". */
  path: string;
  depth: number;
}

let byId: Map<string, TaxonomyCategory> | null = null;

function index(): Map<string, TaxonomyCategory> {
  if (byId) return byId;
  const names = new Map<string, string>();
  for (const line of TAXONOMY_ROWS.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0) names.set(line.slice(0, tab), line.slice(tab + 1));
  }
  byId = new Map();
  for (const [id, name] of names) {
    const parts = id.split("-");
    const chain = parts.map((_, i) => names.get(parts.slice(0, i + 1).join("-")) ?? "");
    byId.set(id, { id, name, path: chain.join(" > "), depth: parts.length });
  }
  return byId;
}

export const taxonomyRelease = (): string => TAXONOMY_RELEASE;

export function categoryById(id: string): TaxonomyCategory | null {
  return index().get(id.replace(/^gid:\/\/shopify\/TaxonomyCategory\//, "")) ?? null;
}

let byPath: Map<string, TaxonomyCategory> | null = null;

/** A category by its full path, "Sporting Goods > … > Tents", whatever its case. */
export function categoryByPath(path: string): TaxonomyCategory | null {
  byPath ??= new Map([...index().values()].map((c) => [c.path.toLowerCase(), c]));
  return byPath.get(path.trim().replace(/\s*>\s*/g, " > ").toLowerCase()) ?? null;
}

/** The id as the Admin API takes it. */
export const categoryGid = (id: string): string => `gid://shopify/TaxonomyCategory/${id}`;

/** A word in its plainest form, so "Jackets" finds "Jacket" and "Accessories" finds "Accessory". */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

const STOP = new Set(["and", "the", "for", "of", "with", "a", "an", "other"]);

/** Words a kind of product names a person by, not a thing: dropped from the kind, kept on a category. */
const AUDIENCE = new Set(["men", "women", "kid", "unisex", "mens", "womens", "kids"]);

/** Two words for one thing, where the taxonomy uses the other. */
const SAME: Record<string, string> = { bike: "bicycle", bicycle: "bike", tee: "t-shirt" };

const UNLIKELY = ["collectible", "toy", "pet", "costume", "doll", "kitchen", "fryer", "grill", "golf", "fan", "welding", "forestry", "beekeeping"];

const words = (text: string): string[] => text.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9-]+/).map((w) => w.replace(/^-+|-+$/g, "")).filter((w) => w && !STOP.has(w)).map(stem);

/**
 * The category a kind of product belongs in, found by its name: the category whose own name says
 * the same thing, or starts with it ("Gloves" in "Gloves & Mittens"), then one whose name carries
 * the kind's head word with the kind's other words along its path. Favoured are the shallow and
 * the ones in the shop's own section for it; branches a shop seldom means (pet, toy, collectible)
 * only where the kind says so. Null where nothing fits plainly: no category beats the wrong one.
 */
export function resolveCategory(kind: string, section = ""): TaxonomyCategory | null {
  const want = words(kind).filter((w) => !AUDIENCE.has(w));
  if (want.length === 0) return null;
  const head = want[want.length - 1];
  const heads = new Set([head, SAME[head]].filter(Boolean));
  const same = (w: string, x: string) => w === x || SAME[w] === x;
  const context = new Set(words(section));
  let best: { c: TaxonomyCategory; score: number } | null = null;
  for (const c of index().values()) {
    const own = words(c.name);
    if (!own.some((w) => heads.has(w))) continue;
    const path = new Set(words(c.path));
    const has = (w: string) => path.has(w) || (SAME[w] !== undefined && path.has(SAME[w]));
    const exact = own.length === want.length && want.every((w) => own.some((x) => same(w, x)));
    const leads = !exact && want.every((w, i) => own[i] !== undefined && same(w, own[i]));
    const covered = want.filter(has).length / want.length;
    // Every word of the kind must be in the category's path: "Hiking Packs" is not "Fanny Packs".
    if (!exact && !leads && covered < 1) continue;
    const extra = own.filter((w) => !want.some((x) => same(x, w))).length;
    const inSection = [...context].filter((w) => path.has(w)).length;
    const astray = UNLIKELY.some((w) => path.has(w) && !want.includes(w)) ? 60 : 0;
    const score = (exact ? 100 : leads ? 70 : 0) + covered * 40 + inSection * 8 - extra * 6 - c.depth * 2 - astray;
    if (!best || score > best.score) best = { c, score };
  }
  return best && best.score >= 20 ? best.c : null;
}
