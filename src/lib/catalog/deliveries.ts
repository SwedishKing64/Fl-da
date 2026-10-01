/**
 * Which of an order's deliveries a line belongs to, and how many of it are due in one.
 *
 * An order form seldom means one delivery. Helly Hansen's has a quantity column per month,
 * November to June, and the shop wrote its numbers in December and June; Burton's RDD sheet has a
 * Requested Delivery Date on every line, November for some and April for the rest. "Only the
 * December delivery" said in the instruction chat used to change nothing, because nothing in the
 * build knew when a line was due.
 *
 * So the reader keeps what each form says — a "Due <when>" quantity per window from the
 * column form (see foldQuantityColumns), or the line's own date — and this is where an instruction
 * is held against it. Pure.
 */

import type { CanonicalLineItem } from "./types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

/** "2026-12", "Dec 26", "December 2026", "2026-12-01", "DEC" (no year) as a year-month, or null. */
export function yearMonth(text: string): { year: number | null; month: number } | null {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{2})/.exec(t);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (dmy) { const y = Number(dmy[3]); return { year: y < 100 ? 2000 + y : y, month: Number(dmy[2]) }; }
  const word = /^([A-Za-z]{3,9})\.?\s*(?:'?(\d{2}|\d{4}))?$/.exec(t) ?? /^(?:(\d{2}|\d{4})\s+)?([A-Za-z]{3,9})$/.exec(t);
  if (word) {
    const name = (word[1] && /^[A-Za-z]/.test(word[1]) ? word[1] : word[2] ?? "").slice(0, 3).toUpperCase();
    const year = word[1] && /^\d/.test(word[1]) ? word[1] : /^\d/.test(word[2] ?? "") ? word[2] : undefined;
    const m = MONTHS.indexOf(name);
    if (m < 0) return null;
    const y = year ? Number(year) : null;
    return { year: y === null ? null : y < 100 ? 2000 + y : y, month: m + 1 };
  }
  return null;
}

export interface DeliveryWindow {
  from?: { year: number | null; month: number };
  to?: { year: number | null; month: number };
  /** 1-based, for a form whose deliveries are only numbered. */
  ordinal?: number;
}

/** The window an instruction names: "2026-12", "2026-12..2027-01", "first". */
export function parseWindow(text: string): DeliveryWindow | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const ord = ORDINALS.indexOf(t.replace(/\s+delivery$/, ""));
  if (ord >= 0) return { ordinal: ord + 1 };
  const num = /^(?:delivery\s*)?(\d)(?:st|nd|rd|th)?$/.exec(t);
  if (num) return { ordinal: Number(num[1]) };
  const [a, b] = t.split("..");
  const from = yearMonth(a);
  if (!from) return null;
  const to = b ? yearMonth(b) : from;
  return to ? { from, to } : null;
}

const index = (ym: { year: number | null; month: number }, fallbackYear: number | null): number | null => {
  const y = ym.year ?? fallbackYear;
  return y === null ? null : y * 12 + ym.month - 1;
};

function within(when: { year: number | null; month: number }, w: DeliveryWindow): boolean {
  if (!w.from || !w.to) return false;
  // A month with no year on either side is matched by month alone.
  if (when.year === null || w.from.year === null || w.to.year === null) {
    const months = new Set<number>();
    const f = w.from.month, t = w.to.month;
    for (let m = f; ; m = (m % 12) + 1) { months.add(m); if (m === t) break; }
    return months.has(when.month);
  }
  const i = index(when, null)!, a = index(w.from, null)!, b = index(w.to, null)!;
  return i >= a && i <= b;
}

/** The per-delivery quantities a line carries, in column order: [label, quantity]. */
export function deliveriesOf(item: CanonicalLineItem): Array<[string, number]> {
  return Object.entries(item.extras ?? {})
    .filter(([k]) => /^Due\s+/i.test(k))
    .map(([k, v]) => [k.replace(/^Due\s+/i, "").trim(), Number(String(v).replace(/[^\d.]/g, "")) || 0] as [string, number]);
}

export interface DeliveryShare {
  /** How many of the line are due in the window; null when the sheet does not say when it is due. */
  quantity: number | null;
}

/**
 * How many of a line are due in the window.
 *
 * From the per-delivery columns where the form has them; else from the line's delivery date, all
 * or nothing; and null where the line says nothing about when it is due, which is for the caller
 * to report rather than guess at.
 */
export function dueInWindow(item: CanonicalLineItem, window: DeliveryWindow): DeliveryShare {
  const parts = deliveriesOf(item);
  if (parts.length > 0) {
    if (window.ordinal) return { quantity: parts[window.ordinal - 1]?.[1] ?? 0 };
    let total = 0;
    for (const [label, qty] of parts) {
      const when = yearMonth(label);
      if (when && within(when, window)) total += qty;
    }
    return { quantity: total };
  }
  const date = (item.deliveryDate ?? "").trim();
  if (date) {
    if (window.ordinal) return { quantity: null };
    const when = yearMonth(date);
    if (!when) return { quantity: null };
    return { quantity: within(when, window) ? item.quantity ?? 0 : 0 };
  }
  return { quantity: null };
}
