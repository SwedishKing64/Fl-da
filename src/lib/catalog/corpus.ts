/**
 * Scoring the reader against documents whose right answers a person has checked.
 *
 * "Reads any invoice" is a claim about documents nobody has shown Flöda yet, so it is measured on a
 * fixed set of real documents from several trades, each with an answer key, and the score is
 * compared run to run. A change that improves one trade and quietly costs another shows up here
 * before it ships. See docs and `scripts/corpus.ts`.
 *
 * The reading measured is what the build starts from: the file read into a table, its columns
 * matched, its rows turned into lines, the rows nobody ordered dropped.
 */

import { isReaderTable, readerMapping } from "./extract/ai";
import type { ExtractedTable } from "./extract/types";
import { applyMapping, suggestMapping, type Mapping } from "./mapping";
import { keepOrderedLines } from "./reference-match";
import { checkTotals } from "./totals";
import type { CanonicalLineItem } from "./types";

/** One line as a person checked it. Fields left out are not scored. */
export interface KeyLine {
  code?: string;
  name?: string;
  quantity: number;
  cost?: number;
  rrp?: number;
  size?: string;
  colour?: string;
  /** Any other option the line varies on: capacity, volume, zip side. */
  option?: string;
}

export interface CorpusKey {
  /** The trade the document comes from: snow, outdoor, bike, clothing, surf, general… */
  trade: string;
  /** What kind of document it is: pdf-text, photo, grid, csv, multi-brand, handwriting… */
  kind: string;
  /** The totals printed on the document, where it prints them. */
  totals?: { units?: number; subtotal?: number };
  lines: KeyLine[];
}

export const SCORED_FIELDS = ["code", "quantity", "cost", "rrp", "size", "colour", "option"] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

export interface DocumentScore {
  expected: number;
  found: number;
  /** Lines read that match no line of the key. */
  extra: number;
  fields: Record<ScoredField, { right: number; of: number }>;
  /** Lines of the key that were not read, for the report. */
  missed: string[];
  /** Field disagreements, for the report: "code 1234: size read M, key S". */
  wrong: string[];
  /** Whether the lines read add up to the totals the key says the document states. */
  addsUp: boolean | null;
}

/** The table a file was read into, as the lines the build would start from. */
export function linesFromTable(table: ExtractedTable): CanonicalLineItem[] {
  const mapping: Mapping = isReaderTable(table.headers) ? readerMapping(table.headers) : suggestMapping(table.headers, table.rows);
  const items = table.rows.map((row) => applyMapping(row, mapping)).filter((i) => i.title || i.sku || i.barcode || i.modelCode);
  return keepOrderedLines(items.map((item) => ({ item, fileId: "doc" }))).kept.map((l) => l.item);
}

const clean = (v: unknown): string => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const sameText = (a: unknown, b: unknown): boolean => clean(a) === clean(b) || clean(a).replace(/[^a-z0-9]/g, "") === clean(b).replace(/[^a-z0-9]/g, "");
const sameNumber = (a: number | null | undefined, b: number | undefined): boolean => a !== null && a !== undefined && b !== undefined && Math.abs(a - b) < 0.005 + Math.abs(b) * 0.0001;

/** What the reader wrote for a scored field, wherever it put it. */
function readValue(line: CanonicalLineItem, field: ScoredField): string | number | null {
  switch (field) {
    case "code": return line.sku || line.barcode || line.modelCode;
    case "quantity": return line.quantity;
    case "cost": return line.costPrice;
    case "rrp": return line.rrp;
    case "size": return line.size || line.length;
    case "colour": return line.colour;
    case "option": return line.variant ?? "";
  }
}

/** The key's value for a field, or undefined where the key leaves it out. */
function keyValue(k: KeyLine, field: ScoredField): string | number | undefined {
  switch (field) {
    case "code": return k.code;
    case "quantity": return k.quantity;
    case "cost": return k.cost;
    case "rrp": return k.rrp;
    case "size": return k.size;
    case "colour": return k.colour;
    case "option": return k.option;
  }
}

/** Which line read stands for which line of the key: by code, then by name and size and colour. */
function pair(read: CanonicalLineItem[], key: KeyLine[]): Array<[KeyLine, CanonicalLineItem | null]> {
  const used = new Set<number>();
  const codeOf = (l: CanonicalLineItem) => [l.sku, l.barcode, l.modelCode].map(clean).filter(Boolean);
  const take = (k: KeyLine): CanonicalLineItem | null => {
    const candidates = read.map((l, i) => ({ l, i })).filter(({ i }) => !used.has(i));
    const sizeAndColour = (l: CanonicalLineItem) => (k.size === undefined || sameText(l.size || l.length, k.size)) && (k.colour === undefined || sameText(l.colour, k.colour)) && (k.option === undefined || sameText(l.variant ?? "", k.option));
    let hit = k.code ? candidates.find(({ l }) => codeOf(l).includes(clean(k.code)) && sizeAndColour(l)) ?? candidates.find(({ l }) => codeOf(l).includes(clean(k.code))) : undefined;
    if (!hit && k.name) hit = candidates.find(({ l }) => clean(l.title).includes(clean(k.name)) && sizeAndColour(l)) ?? candidates.find(({ l }) => clean(l.title).includes(clean(k.name)));
    if (!hit) return null;
    used.add(hit.i);
    return hit.l;
  };
  return key.map((k) => [k, take(k)]);
}

export function scoreDocument(read: CanonicalLineItem[], key: CorpusKey): DocumentScore {
  const fields = Object.fromEntries(SCORED_FIELDS.map((f) => [f, { right: 0, of: 0 }])) as DocumentScore["fields"];
  const missed: string[] = [];
  const wrong: string[] = [];
  const pairs = pair(read, key.lines);
  for (const [k, l] of pairs) {
    const label = k.code ?? k.name ?? "?";
    if (!l) { missed.push(`${label}${k.size ? ` ${k.size}` : ""}${k.colour ? ` ${k.colour}` : ""}`); }
    for (const f of SCORED_FIELDS) {
      const want = keyValue(k, f);
      if (want === undefined) continue;
      fields[f].of++;
      if (!l) continue;
      const got = readValue(l, f);
      // A code is right wherever the reader kept it: a size grid's lines carry a code per size
      // ("OW3101.S") and the style's own code beside it.
      if (f === "code" && [l.sku, l.barcode, l.modelCode].some((c) => sameText(c, want) || sameText(String(c).replace(/\.[^.]+$/, ""), want))) { fields[f].right++; continue; }
      // An option is right where the reader kept it as the variant, or kept the column it came in
      // (its extras), which the build takes as an option: a scent, a capacity, a zip side.
      // …and a size is right wherever the reader kept it: a sleeping bag's Regular is its variant.
      const kept = (f === "option" || f === "size") && [l.variant ?? "", ...Object.values(l.extras ?? {})].some((v) => sameText(v, want));
      const ok = kept || (typeof want === "number" ? sameNumber(typeof got === "number" ? got : got === null || got === "" ? null : Number(got), want) : sameText(got, want));
      if (ok) fields[f].right++;
      else wrong.push(`${label}: ${f} read ${JSON.stringify(got)}, key ${JSON.stringify(want)}`);
    }
  }
  const found = pairs.filter(([, l]) => l !== null).length;
  const stated = key.totals ? { units: key.totals.units ?? null, subtotal: key.totals.subtotal ?? null } : null;
  const totals = stated ? checkTotals(read, stated) : null;
  return { expected: key.lines.length, found, extra: Math.max(0, read.length - found), fields, missed, wrong, addsUp: totals ? totals.ok : null };
}

export interface Tally {
  documents: number;
  linesExpected: number;
  linesFound: number;
  extra: number;
  fieldsRight: number;
  fieldsOf: number;
  addsUp: number;
  totalsChecked: number;
}

export const emptyTally = (): Tally => ({ documents: 0, linesExpected: 0, linesFound: 0, extra: 0, fieldsRight: 0, fieldsOf: 0, addsUp: 0, totalsChecked: 0 });

export function addToTally(t: Tally, s: DocumentScore): Tally {
  const right = SCORED_FIELDS.reduce((n, f) => n + s.fields[f].right, 0);
  const of = SCORED_FIELDS.reduce((n, f) => n + s.fields[f].of, 0);
  return {
    documents: t.documents + 1,
    linesExpected: t.linesExpected + s.expected,
    linesFound: t.linesFound + s.found,
    extra: t.extra + s.extra,
    fieldsRight: t.fieldsRight + right,
    fieldsOf: t.fieldsOf + of,
    addsUp: t.addsUp + (s.addsUp === true ? 1 : 0),
    totalsChecked: t.totalsChecked + (s.addsUp === null ? 0 : 1),
  };
}

const pct = (a: number, b: number) => (b === 0 ? 100 : Math.round((a / b) * 1000) / 10);
export const linesPct = (t: Tally) => pct(t.linesFound, t.linesExpected);
export const fieldsPct = (t: Tally) => pct(t.fieldsRight, t.fieldsOf);

/** Trades whose field score fell by more than the allowance against a recorded baseline. */
export function regressions(now: Record<string, Tally>, baseline: Record<string, { fields: number; lines: number }>, allowance = 0.5): string[] {
  const out: string[] = [];
  for (const [trade, was] of Object.entries(baseline)) {
    const t = now[trade];
    if (!t) continue;
    if (fieldsPct(t) < was.fields - allowance) out.push(`${trade}: fields ${fieldsPct(t)}% against a baseline of ${was.fields}%`);
    if (linesPct(t) < was.lines - allowance) out.push(`${trade}: lines found ${linesPct(t)}% against a baseline of ${was.lines}%`);
  }
  return out;
}
