/**
 * The shop's bindings for ski packages, with what each sells for and costs (asked 2026-10-20).
 *
 * A ski is packaged with the bindings somebody picks for it, from this list: the Griffon, the
 * Squire, the Strive 12, the Pivot 2.0 … Each is a Binding Option on the package, priced at the
 * ski's recommended retail plus the binding's, and costed at the ski's cost plus the binding's
 * wholesale. The shop's list is built in (SHOP_BINDINGS); a newer one loaded in Settings replaces it.
 */

import type { BindingChoice } from "./packages";

export interface BindingEntry {
  name: string;
  rrp: number;
  cost: number | null;
}

export interface BindingList {
  entries: BindingEntry[];
  file: string;
  updatedAt: string;
}

/**
 * The shop's own binding list, built in at its request (2026-10-20) so it is there without being
 * loaded: its RRP and its wholesale for each binding it packages skis with. A newer list loaded in
 * Settings takes its place.
 */
export const SHOP_BINDINGS: BindingEntry[] = [
  { name: "Marker Griffon", rrp: 459.99, cost: 241 },
  { name: "Marker Squire", rrp: 349, cost: 186.63 },
  { name: "Salomon Strive 12", rrp: 379.99, cost: 186.94 },
  { name: "Look Pivot 2.0 11", rrp: 649.99, cost: 295 },
  { name: "Tyrolia Attack LYT 12", rrp: 429.99, cost: 195 },
  { name: "Tyrolia Attack LYT 11", rrp: 349.99, cost: 159 },
  { name: "Look Pivot 2.0 15", rrp: 799.99, cost: 363.18 },
  { name: "Marker Griffon X", rrp: 479.99, cost: 243.18 },
];

const num = (raw: string): number | null => {
  const v = (raw ?? "").toString().replace(/[$,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
};

/**
 * The list out of a sheet: a heading row with the binding's name and its RRP — "Binding Name",
 * "RRP", "Wholesale" — then a binding a row. Rows without a name or an RRP are left out.
 */
export function parseBindingList(grid: string[][]): BindingEntry[] {
  const norm = (c: string) => (c ?? "").toString().trim().toLowerCase();
  const at = grid.findIndex((r) => (r ?? []).some((c) => /\b(binding|name)\b/.test(norm(c))) && (r ?? []).some((c) => /\brrp\b|retail/.test(norm(c))));
  if (at < 0) return [];
  const head = grid[at].map(norm);
  const nameCol = head.findIndex((c) => /\b(binding|name)\b/.test(c));
  const rrpCol = head.findIndex((c) => /\brrp\b|retail/.test(c));
  const costCol = head.findIndex((c) => /wholesale|\bcost\b|w\/s|\bws\b/.test(c));
  const seen = new Set<string>();
  const out: BindingEntry[] = [];
  for (const row of grid.slice(at + 1)) {
    const name = (row?.[nameCol] ?? "").toString().replace(/\s+/g, " ").trim();
    const rrp = num(row?.[rrpCol] ?? "");
    if (!name || rrp === null || rrp <= 0 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, rrp, cost: costCol >= 0 ? num(row?.[costCol] ?? "") : null });
  }
  return out;
}

/** A binding from the list as a package's Binding Option. */
export function choiceOf(entry: BindingEntry): BindingChoice {
  return { label: entry.name, shortName: entry.name, rrp: entry.rrp, cost: entry.cost };
}

/** The ski a choice belongs to, kept the same through a rebuild: its name without the year, lower case. */
export function skiKey(title: string): string {
  return title.replace(/\s+20\d{2}\b/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The bindings picked for a ski, as package options: undefined where nobody has picked for it
 * (the defaults then apply), empty where somebody unticked every binding (no package).
 */
export function pickerFor(entries: BindingEntry[], picks: Record<string, string[]>): (ski: { title: string }) => BindingChoice[] | undefined {
  return (ski) => {
    const names = picks[skiKey(ski.title)];
    if (!names) return undefined;
    return names.map((n) => entries.find((e) => e.name.toLowerCase() === n.toLowerCase())).filter((e): e is BindingEntry => Boolean(e)).map(choiceOf);
  };
}
