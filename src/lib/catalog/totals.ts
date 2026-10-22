/**
 * Whether a document's lines add up to the document's own totals.
 *
 * A reader that drops a line, reads one twice or takes a line total for a unit price gives no sign
 * of it in the lines themselves; the printed totals are the one check the document carries against
 * its own reading. Units are compared exactly. The goods value is compared within half a percent
 * (and a dollar), since a printed subtotal can round per line, and only where the document states
 * one: a total that includes freight or tax is the reader's to leave out, not this check's.
 */

export interface StatedTotals {
  /** Total units the document states, or null where it prints none. */
  units: number | null;
  /** The goods subtotal it states, before freight and tax, or null where it prints none. */
  subtotal: number | null;
}

export interface TotalsCheck {
  /** False only when a stated total disagrees with the lines; nothing stated is not a failure. */
  ok: boolean;
  /** Whether there was anything to check against. */
  checked: boolean;
  units: { read: number; stated: number | null };
  subtotal: { read: number; stated: number | null };
  /** One sentence for the person, empty when it adds up or nothing was stated. */
  message: string;
}

interface LineLike { quantity: number | null; costPrice: number | null }

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function checkTotals(lines: LineLike[], stated: StatedTotals | null | undefined): TotalsCheck {
  const units = lines.reduce((n, l) => n + (l.quantity ?? 0), 0);
  const subtotal = Math.round(lines.reduce((n, l) => n + (l.quantity ?? 0) * (l.costPrice ?? 0), 0) * 100) / 100;
  const su = stated?.units ?? null;
  const ss = stated?.subtotal ?? null;
  const unitsOff = su !== null && su > 0 && Math.abs(units - su) > 0.001;
  const valueOff = ss !== null && ss > 0 && Math.abs(subtotal - ss) > Math.max(1, ss * 0.005);
  const checked = (su !== null && su > 0) || (ss !== null && ss > 0);
  const parts: string[] = [];
  if (unitsOff) parts.push(`${units} units against the ${su} it states`);
  if (valueOff) parts.push(`${money(subtotal)} against the ${money(ss!)} it states`);
  return {
    ok: !unitsOff && !valueOff,
    checked,
    units: { read: units, stated: su },
    subtotal: { read: subtotal, stated: ss },
    message: parts.length ? `The lines read add up to ${parts.join(", and ")}: a line may be missing, doubled or misread. Check the lines against the document before building.` : "",
  };
}

/** How far a reading is from its document's totals, for choosing the better of two reads. */
export function totalsDistance(c: TotalsCheck): number {
  const du = c.units.stated !== null && c.units.stated > 0 ? Math.abs(c.units.read - c.units.stated) / c.units.stated : 0;
  const ds = c.subtotal.stated !== null && c.subtotal.stated > 0 ? Math.abs(c.subtotal.read - c.subtotal.stated) / c.subtotal.stated : 0;
  return du + ds;
}
