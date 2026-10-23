/**
 * An order form and the invoice for it, read together.
 *
 * They say different things, and each is the authority on its own part. The order form carries
 * what the supplier's catalogue knows: barcodes, the recommended retail, the full name. The
 * invoice is what actually arrived, at what it actually cost: the quantities shipped, and the unit
 * price after any indent or early-order discount. So the lines are the invoice's, and each is
 * filled in from its line on the order form where the invoice left a gap.
 */

import type { InvoiceLine } from "./reconcile";

export interface Joined {
  lines: InvoiceLine[];
  /** Invoice lines that found their line on the order form. */
  matched: number;
  /** Order-form lines nothing on the invoice was for: not shipped, or still to come. */
  notShipped: InvoiceLine[];
}

const key = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1));

/** How alike two lines' names are: the share of the shorter name's words the other has. */
function nameLikeness(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].filter((w) => big.has(w)).length / small.size;
}

const sameSize = (a: InvoiceLine, b: InvoiceLine) => !a.size || !b.size || key(a.size) === key(b.size);
/** "BLK" is "Black": the shorter written as a supplier's shorthand of the longer, its letters in order. */
function shorthandOf(short: string, long: string): boolean {
  if (!short || short[0] !== long[0]) return false;
  let at = 0;
  for (const ch of long) if (ch === short[at]) at++;
  return at === short.length;
}
const sameColour = (a: InvoiceLine, b: InvoiceLine) => {
  if (!a.colour || !b.colour) return true;
  const [x, y] = [key(a.colour), key(b.colour)].sort((p, q) => p.length - q.length);
  return x === y || y.includes(x) || shorthandOf(x, y);
};

/** The order-form line an invoice line is for: same barcode, else same code and size, else the same name, size and colour. */
export function lineOnForm(line: InvoiceLine, form: InvoiceLine[], taken: Set<InvoiceLine>): InvoiceLine | undefined {
  const free = form.filter((f) => !taken.has(f));
  if (line.barcode) {
    const byBarcode = free.find((f) => key(f.barcode) === key(line.barcode));
    if (byBarcode) return byBarcode;
  }
  if (line.sku) {
    const byCode = free.filter((f) => key(f.sku) === key(line.sku) && sameSize(f, line) && sameColour(f, line));
    if (byCode.length > 0) return byCode[0];
  }
  const byName = free
    .filter((f) => sameSize(f, line) && sameColour(f, line) && (!line.size || Boolean(f.size)))
    .map((f) => ({ f, score: nameLikeness(f.title, line.title) }))
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score);
  return byName[0]?.f;
}

/** The invoice's lines, each filled in from its order-form line. */
export function joinOrderAndInvoice(form: InvoiceLine[], invoice: InvoiceLine[]): Joined {
  const taken = new Set<InvoiceLine>();
  let matched = 0;
  const lines = invoice.map((line) => {
    const on = lineOnForm(line, form, taken);
    if (!on) return line;
    taken.add(on);
    matched++;
    return {
      ...on,
      ...line,
      // What arrived and what it cost are the invoice's; what the catalogue knows is the form's
      // wherever the invoice is silent.
      quantity: line.quantity,
      costPrice: line.costPrice ?? on.costPrice,
      barcode: line.barcode || on.barcode,
      sku: line.sku || on.sku,
      rrp: line.rrp ?? on.rrp,
      title: on.named || on.title.length > line.title.length ? on.title : line.title,
      size: line.size || on.size,
      colour: line.colour || on.colour,
    };
  });
  const notShipped = form.filter((f) => !taken.has(f) && (f.quantity ?? 0) > 0);
  return { lines, matched, notShipped };
}

/**
 * Which of two documents is the invoice: the one its name or its form says arrived. A file named
 * as an invoice or a packing slip is; one named as an order or confirmation is not; otherwise the
 * PDF or photo beside a spreadsheet, and then the one with fewer lines (what shipped, of what was
 * ordered).
 */
export function invoiceOf<T extends { name: string; lines: number }>(a: T, b: T): { invoice: T; form: T } {
  const score = (d: T, other: T) =>
    (/invoice|\binv\b|tax|packing|despatch|dispatch|delivery|shipment/i.test(d.name) ? 4 : 0)
    - (/order|confirmation|\bform\b|indent|pre-?season|booking/i.test(d.name) ? 4 : 0)
    + (/\.(pdf|jpe?g|png|heic|webp)$/i.test(d.name) && !/\.(pdf|jpe?g|png|heic|webp)$/i.test(other.name) ? 1 : 0)
    + (d.lines < other.lines ? 1 : 0);
  return score(a, b) >= score(b, a) ? { invoice: a, form: b } : { invoice: b, form: a };
}
