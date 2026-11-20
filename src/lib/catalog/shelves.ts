/**
 * The shop's shelves in its own words: a tag or collection renamed, merged into another, placed
 * under a parent, or marked seasonal.
 *
 * Tags and collections come from the export and the website as they were. A shop that has
 * since tidied its menus says so here once: "Packs" is now "Backpacks"; "Daypacks" and "Hiking
 * packs" both go under "Backpacks"; "Trail shoes" sits under "Footwear", so a trail shoe carries
 * both; "Rain jackets" is seasonal, so every product on it carries the season's tag. Applied at
 * build to every product's tags and collections. Pure apart from the list in force.
 */

export interface Shelf {
  name: string;
  kind: "tag" | "collection";
  /** What it is now called, or the shelf it is merged into. Empty to keep the name. */
  becomes: string;
  /** The shelf above it, carried by every product on this one. Empty for none. */
  under: string;
  /** A seasonal shelf: its products carry the current season's tag. See seasons.ts. */
  seasonal: boolean;
}

export const SHELVES_KEY = "shop.shelves";
const MAX_SHELVES = 500;
const MAX_DEPTH = 5;

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim();

export function cleanShelves(input: unknown): Shelf[] {
  if (!Array.isArray(input)) return [];
  const out: Shelf[] = [];
  for (const x of input.slice(0, MAX_SHELVES)) {
    if (!x || typeof x !== "object") continue;
    const s = x as Record<string, unknown>;
    const name = str(s.name, 120);
    const becomes = str(s.becomes, 120);
    const under = str(s.under, 120);
    const seasonal = s.seasonal === true;
    if (!name || (!becomes && !under && !seasonal)) continue;
    if (becomes.toLowerCase() === name.toLowerCase()) continue;
    out.push({ name, kind: s.kind === "collection" ? "collection" : "tag", becomes, under, seasonal });
  }
  return out;
}

let active: Shelf[] = [];
export function setShelves(shelves: Shelf[]): void { active = shelves; }
export function shelvesInForce(): Shelf[] { return active; }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The names on one kind of shelf, with renames and merges applied, parents added, and the season's tag where a shelf is seasonal. */
function applyKind(names: string[], shelves: Shelf[], seasonTag: string): string[] {
  const out: string[] = [];
  const add = (n: string) => { const t = n.trim(); if (t && !out.some((x) => same(x, t))) out.push(t); };
  const shelfOf = (n: string) => shelves.find((s) => same(s.name, n));
  const resolve = (n: string, depth = 0): string => { const s = shelfOf(n); return s?.becomes && depth < MAX_DEPTH ? resolve(s.becomes, depth + 1) : n; };
  for (const n of names) add(resolve(n));
  // Parents, walking up; a parent that is itself renamed lands on its new name.
  for (let i = 0; i < out.length && i < MAX_SHELVES; i++) {
    let s = shelfOf(out[i]);
    let depth = 0;
    while (s?.under && depth++ < MAX_DEPTH) { const parent = resolve(s.under); add(parent); s = shelfOf(parent); }
  }
  if (seasonTag && out.some((n) => shelfOf(n)?.seasonal)) add(seasonTag);
  return out;
}

/** A product's tags and collections, as the shop's shelves have them. */
export function applyShelves(tags: string[], collections: string[], shelves: Shelf[], seasonTag = ""): { tags: string[]; collections: string[] } {
  if (!shelves.length) return { tags, collections };
  return {
    tags: applyKind(tags, shelves.filter((s) => s.kind === "tag"), seasonTag),
    collections: applyKind(collections, shelves.filter((s) => s.kind === "collection"), seasonTag),
  };
}

/** Each shelf's rule as a sentence. */
export function describeShelves(shelves: Shelf[]): string[] {
  return shelves.map((s) => {
    const what = s.kind === "collection" ? "collection" : "tag";
    const bits: string[] = [];
    if (s.becomes) bits.push(`is now "${s.becomes}"`);
    if (s.under) bits.push(`sits under "${s.under}", which every product on it carries too`);
    if (s.seasonal) bits.push("is seasonal: its products carry the season's tag");
    return `The ${what} "${s.name}" ${bits.join(", and ")}.`;
  });
}
