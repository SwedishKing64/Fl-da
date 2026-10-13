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

/**
 * What a line has to say about when it is due — the part of a line item, or of an invoice line,
 * this file reads. `due` is the per-delivery quantities already read off a form's columns, by the
 * window's label; `extras` is the same thing still under the "Due <label>" headings the reader left.
 */
export interface Dated {
  quantity: number | null;
  deliveryDate?: string;
  extras?: Record<string, string>;
  due?: Record<string, number>;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

/** "2026-12", "Dec 26", "December 2026", "2026-12-01", "DEC" (no year) as a year-month, or null. */
export function yearMonth(text: string): { year: number | null; month: number } | null {
  const t = text.trim();
  // A year with no month: "26", "2026", "W26". Month 0 says so.
  const bare = /^(?:w|fw|aw|s|ss)?\s*(?:20)?(\d{2})$/i.exec(t);
  if (bare && Number(bare[1]) >= 20 && Number(bare[1]) <= 40) return { year: 2000 + Number(bare[1]), month: 0 };
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
  // A year on its own is the whole of it: "only what is due in 2026".
  const year = /^(?:20)?(\d{2})$/.exec(t) ?? /^(20\d{2})$/.exec(t);
  if (year) {
    const y = year[1].length === 2 ? 2000 + Number(year[1]) : Number(year[1]);
    return { from: { year: y, month: 1 }, to: { year: y, month: 12 } };
  }
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
  // A line dated by year alone ("26", "2026") is in any window that spans part of that year.
  if (when.month === 0) {
    if (when.year === null || w.from.year === null || w.to.year === null) return false;
    return when.year >= w.from.year && when.year <= w.to.year;
  }
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
export function deliveriesOf(item: Dated): Array<[string, number]> {
  if (item.due) return Object.entries(item.due).map(([label, qty]) => [label, qty] as [string, number]);
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
export function dueInWindow(item: Dated, window: DeliveryWindow): DeliveryShare {
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

/**
 * The lines due in the window, each with that delivery's quantity, and how many lines said nothing
 * about when they are due — those are kept as they are, since dropping them would lose an order
 * whose form has no dates, and the caller says so.
 */
export function narrowToWindow<T extends Dated>(lines: T[], window: DeliveryWindow): { lines: T[]; undated: number } {
  const out: T[] = [];
  let undated = 0;
  for (const line of lines) {
    const share = dueInWindow(line, window);
    if (share.quantity === null) { undated++; out.push(line); continue; }
    if (share.quantity > 0) out.push({ ...line, quantity: share.quantity });
  }
  return { lines: out, undated };
}

/**
 * The delivery window an instruction asks for, as text parseWindow reads, or null when the
 * instruction is about something else.
 *
 * "Only the December 2026 delivery", "just what has an estimated delivery of 26", "only the lines
 * due in 2026", "first delivery only". Spoken about a delivery, not a product: an instruction with
 * no word for a delivery in it is left alone, whatever years it mentions.
 */
export function deliveryAsked(instruction: string): string | null {
  const t = instruction.trim().toLowerCase();
  if (!/\b(deliver\w*|due|arriv\w*|eta|etd|shipp?\w*|dated)\b/.test(t)) return null;
  if (!/\b(only|just|nothing but|solely)\b/.test(t)) return null;
  const ord = /\b(first|second|third|fourth|fifth|sixth|\d(?:st|nd|rd|th))\s+(?:delivery|drop|shipment)\b/.exec(t);
  if (ord) return ord[1];
  const monthWord = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const span = new RegExp(`\\b${monthWord}\\s*'?(\\d{2}|20\\d{2})?\\s*(?:to|-|–|until|through)\\s*${monthWord}\\s*'?(\\d{2}|20\\d{2})?`).exec(t);
  if (span) {
    const a = yearMonth(`${span[1]} ${span[2] ?? ""}`.trim()), b = yearMonth(`${span[3]} ${span[4] ?? ""}`.trim());
    if (a && b) {
      // A month with no year of its own takes the other end's, so "Dec to Jan 27" is Dec 26 to Jan 27 only when said; else both are months alone.
      const label = (ym: { year: number | null; month: number }, other: number | null) => {
        const y = ym.year ?? other;
        return y === null ? MONTHS[ym.month - 1] : `${y}-${String(ym.month).padStart(2, "0")}`;
      };
      return `${label(a, b.year === null ? null : (a.year ?? (b.month < a.month ? b.year - 1 : b.year)))}..${label(b, a.year)}`;
    }
  }
  const month = new RegExp(`\\b${monthWord}\\s*'?(\\d{2}|20\\d{2})?\\b`).exec(t);
  if (month) return `${month[1]} ${month[2] ?? ""}`.trim();
  const year = /\b(20\d{2})\b/.exec(t) ?? /\b(?:of|in|for|dated)\s+'?(\d{2})\b/.exec(t) ?? /\b(?:w|fw|aw)(\d{2})\b/.exec(t);
  if (year) return year[1].length === 2 ? `20${year[1]}` : year[1];
  return null;
}
