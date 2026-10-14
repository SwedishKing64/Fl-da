/**
 * The shop's supplier list, and an invoice's supplier matched to it.
 *
 * QuickBooks matches a bill to a supplier by name, letter for letter, and makes a new supplier of
 * anything it does not know. Invoices print the company's full legal name — "Burton Snowboards
 * Australia Pty Ltd" — where the shop's QuickBooks has "Burton Australia Pty Ltd". So the shop
 * gave its supplier contact list (QuickBooks' own export), and the name on that list is the one
 * written. Only the names are kept from it, never the phone numbers, emails or addresses.
 *
 * Names are compared without what every company name carries — Pty Ltd, Limited, Australia,
 * punctuation, "&" against "and" — and a long word one letter out still counts. A list name of
 * one word is taken only where the invoice's name starts with it, so "Burton" finds "Burton
 * Snowboards" but "Post" does not find "Mountain Post Supplies".
 */

import type { Bill } from "./quickbooks";

export interface SupplierEntry {
  /** The name as QuickBooks has it — what the bill is written with. */
  name: string;
  /** Other names the list gives the same supplier: its "Full name" column. */
  aliases: string[];
}

export interface SupplierList {
  entries: SupplierEntry[];
  /** The file it came from and when, for the screen. */
  file: string;
  updatedAt: string;
}

export type SupplierMatch =
  | { kind: "exact" | "close"; name: string }
  | { kind: "unsure"; names: string[] }
  | { kind: "none" };

const STOP = new Set(["pty", "ltd", "limited", "proprietary", "pl", "inc", "incorporated", "llc", "co", "company", "corp", "corporation", "the", "australia", "australian", "aust", "aus", "au", "australasia", "and"]);

/** A name as the words that tell one company from another. */
export function nameWords(name: string, keepAll = false): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bp\/l\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && (keepAll || !STOP.has(w)));
}

/** Whether two words are the same, allowing one letter out in a long one: "attvest", "atvest". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** How well a printed name fits one of the list's names, 0 to 1. */
export function fit(printed: string[], listed: string[]): number {
  if (printed.length === 0 || listed.length === 0) return 0;
  const found = (w: string, among: string[]) => among.some((x) => sameWord(w, x));
  const listedFound = listed.filter((w) => found(w, printed)).length;
  const printedFound = printed.filter((w) => found(w, listed)).length;
  if (listedFound === listed.length && printedFound === printed.length) return 1;
  // Every word of the list's name is on the invoice: "Burton" in "Burton Snowboards".
  if (listedFound === listed.length) {
    if (listed.length === 1 && !sameWord(listed[0], printed[0])) return 0;
    return 0.8 + 0.2 * (listed.length / printed.length);
  }
  // Every word on the invoice is in the list's name: "Bunnings" against "Bunnings Warehouse".
  if (printedFound === printed.length) return 0.72 + 0.2 * (printed.length / listed.length);
  return 0.8 * ((2 * Math.min(listedFound, printedFound)) / (printed.length + listed.length));
}

const ACCEPT = 0.7;

/** The supplier on the list that a name printed on an invoice belongs to. */
export function matchSupplier(printed: string, list: SupplierEntry[]): SupplierMatch {
  const words = nameWords(printed);
  if (words.length === 0 || list.length === 0) return { kind: "none" };
  const scored = list
    .map((e) => ({ name: e.name, score: Math.max(...[e.name, ...e.aliases].map((n) => fit(words, nameWords(n.replace(/\([^)]*\)/g, " "))))) }))
    .filter((s) => s.score >= ACCEPT)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: "none" };
  let best = scored[0];
  let rivals = scored.filter((s) => s.name !== best.name && best.score - s.score < 0.03);
  if (rivals.length > 0) {
    // Level on the words that matter: the full names decide, "Australia" and all — "Australia Post" over "Post".
    const whole = nameWords(printed, true);
    const tied = [best, ...rivals].map((s) => ({ ...s, whole: fit(whole, nameWords(s.name.replace(/\([^)]*\)/g, " "), true)) })).sort((a, b) => b.whole - a.whole);
    if (tied[0].whole > tied[1].whole) { best = tied[0]; rivals = []; }
  }
  if (rivals.length > 0) return { kind: "unsure", names: [best.name, ...rivals.map((r) => r.name)] };
  return { kind: best.score === 1 ? "exact" : "close", name: best.name };
}

/**
 * The supplier list out of QuickBooks' export: the row headed "Supplier", then a name a row.
 * The "Full name" column, where it differs, is kept as another name for the same supplier.
 */
export function parseSupplierList(grid: string[][]): SupplierEntry[] {
  const at = grid.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "supplier"));
  if (at < 0) return [];
  const head = grid[at].map((c) => c.trim().toLowerCase());
  const nameCol = head.indexOf("supplier");
  const fullCol = head.findIndex((c) => c === "full name" || c === "company name" || c === "display name");
  const seen = new Set<string>();
  const out: SupplierEntry[] = [];
  for (const row of grid.slice(at + 1)) {
    const name = (row[nameCol] ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const full = fullCol >= 0 ? (row[fullCol] ?? "").replace(/\s+/g, " ").trim() : "";
    out.push({ name, aliases: full && full !== name.replace(/\s+/g, " ") ? [full] : [] });
  }
  return out;
}

/**
 * The bill named as the list names its supplier, where the list has it. What the invoice printed
 * is kept beside it, so a match can be checked and undone, and so a list loaded later can match
 * again from the printed name rather than from an earlier match.
 */
export function nameFromList(bill: Bill, list: SupplierEntry[]): Bill {
  const printed = bill.printedSupplier ?? bill.supplier;
  const match = matchSupplier(printed, list);
  return match.kind === "exact" || match.kind === "close" ? { ...bill, supplier: match.name, printedSupplier: printed } : { ...bill, supplier: printed, printedSupplier: printed };
}
