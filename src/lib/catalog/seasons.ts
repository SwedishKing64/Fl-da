/**
 * The shop's seasons: what they are called and when they turn over.
 *
 * An Australian shop's winter is a European supplier's summer, and a northern supplier's "FW26"
 * lands on a southern shelf in April. The shop names its seasons and gives each a start day;
 * the current season follows the calendar from that, and its tag ("Winter 2026", by the shop's
 * own pattern) goes on every product filed on a seasonal shelf (see shelves.ts). The model year
 * in titles stays as the naming conventions have it. Pure apart from the vocabulary in force.
 */

export interface Season {
  name: string;
  /** The day it starts, "MM-DD". */
  starts: string;
}

export interface SeasonVocabulary {
  seasons: Season[];
  /** The tag's shape: {season} and {year}, where the year is the one the season started in. */
  tag: string;
}

export const SEASONS_KEY = "shop.seasons";
export const DEFAULT_SEASONS: SeasonVocabulary = { seasons: [], tag: "{season} {year}" };

const DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function cleanSeasons(input: unknown): SeasonVocabulary {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const seasons: Season[] = [];
  if (Array.isArray(v.seasons)) {
    for (const s of v.seasons.slice(0, 12)) {
      if (!s || typeof s !== "object") continue;
      const x = s as Record<string, unknown>;
      const name = String(x.name ?? "").slice(0, 40).trim();
      const starts = String(x.starts ?? "").trim();
      if (name && DAY.test(starts) && !seasons.some((o) => o.name.toLowerCase() === name.toLowerCase())) seasons.push({ name, starts });
    }
  }
  seasons.sort((a, b) => a.starts.localeCompare(b.starts));
  const tag = String(v.tag ?? "").slice(0, 60).trim() || DEFAULT_SEASONS.tag;
  return { seasons, tag };
}

let active: SeasonVocabulary = DEFAULT_SEASONS;
export function setSeasons(v: SeasonVocabulary): void { active = v; }
export function seasonsInForce(): SeasonVocabulary { return active; }

/** The season a date falls in, and the year it started: the latest start on or before the date, wrapping to last year's last season. */
export function currentSeason(vocab: SeasonVocabulary, date = new Date()): { name: string; year: number } | null {
  if (!vocab.seasons.length) return null;
  const y = date.getFullYear();
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const started = [...vocab.seasons].filter((s) => s.starts <= md);
  if (started.length) return { name: started[started.length - 1].name, year: y };
  return { name: vocab.seasons[vocab.seasons.length - 1].name, year: y - 1 };
}

/** The current season's tag, by the shop's pattern; empty where no seasons are named. */
export function seasonTag(vocab: SeasonVocabulary, date = new Date()): string {
  const s = currentSeason(vocab, date);
  if (!s) return "";
  return vocab.tag.replace(/\{season\}/g, s.name).replace(/\{year\}/g, String(s.year)).replace(/\{yy\}/g, String(s.year).slice(-2)).trim();
}

/** The vocabulary as sentences. */
export function describeSeasons(vocab: SeasonVocabulary, date = new Date()): string {
  if (!vocab.seasons.length) return "No seasons named yet. Name them and when each starts, and every product on a seasonal shelf carries the season's tag.";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const when = (s: Season) => `${s.name} from ${Number(s.starts.slice(3))} ${months[Number(s.starts.slice(0, 2)) - 1]}`;
  return `The seasons are ${vocab.seasons.map(when).join(", ")}; it is ${seasonTag(vocab, date)} now, and that is the tag a product on a seasonal shelf carries.`;
}
