/**
 * An invoice and the order sheet it was shipped against, read as one delivery (asked 2026-10-22).
 *
 * The order sheet is what was ordered, with what the supplier's form carries: barcodes, sizes,
 * colours, the recommended retail. The invoice is what actually arrived, and at what price — and
 * the two are often different: a line short-shipped, a size swapped, a cost that moved. So the
 * invoice decides the count and the cost of every line, and the order sheet fills in what the
 * invoice does not say. A line ordered and not invoiced did not arrive and is left out; a line
 * invoiced and not on the order is kept as the invoice has it. The result is matched against the
 * shop's export like any other delivery.
 *
 * A line is paired by barcode, then by item code, then by its name, size and colour. A pair is
 * never guessed at: an invoice line two order lines fit equally is kept as the invoice has it.
 */

import type { InvoiceLine } from "./reconcile";

export interface MergeReport {
  lines: InvoiceLine[];
  /** Invoice lines paired with an order line. */
  paired: number;
  /** Invoice lines with nothing on the order sheet to pair with. */
  invoiceOnly: InvoiceLine[];
  /** Lines ordered that the invoice does not have: they did not arrive. */
  notArrived: InvoiceLine[];
  /** Paired lines whose cost on the invoice is not the order's: the invoice's is used. */
  costChanged: Array<{ line: InvoiceLine; ordered: number; invoiced: number }>;
  /** Paired lines where a different number arrived than was ordered. */
  countChanged: Array<{ line: InvoiceLine; ordered: number; invoiced: number }>;
}

const digits = (s: string | undefined): string => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const code = (s: string | undefined): string => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = (s: string | undefined): string[] => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !/^(mens?|womens?|ladies|unisex|the)$/.test(w));
const sizeOf = (s: string | undefined): string => (s ?? "").toLowerCase().replace(/\s+/g, "").replace(/^(\d{2})x$/, "$1.5");

/** The same model by name: every word of the shorter name is in the longer one. */
function sameName(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

function sameColour(a: string | undefined, b: string | undefined): boolean {
  const x = words(a), y = words(b);
  if (x.length === 0 || y.length === 0) return true;
  return x.some((w) => y.includes(w));
}

/** Item codes that are one product's: equal, or one the other's start (a style code and its colour-size code). */
function sameCode(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.startsWith(short);
}

export function mergeInvoiceWithOrder(invoice: InvoiceLine[], order: InvoiceLine[]): MergeReport {
  const used = new Set<number>();
  const report: MergeReport = { lines: [], paired: 0, invoiceOnly: [], notArrived: [], costChanged: [], countChanged: [] };

  const pairFor = (line: InvoiceLine): number => {
    const free = order.map((o, i) => ({ o, i })).filter(({ i }) => !used.has(i));
    const one = (hits: Array<{ o: InvoiceLine; i: number }>): number => (hits.length === 1 ? hits[0].i : -1);
    const bc = digits(line.barcode);
    if (bc.length >= 8) {
      const hit = one(free.filter(({ o }) => digits(o.barcode) === bc));
      if (hit >= 0) return hit;
    }
    const size = sizeOf(line.size);
    const fits = ({ o }: { o: InvoiceLine }) => (!size || !sizeOf(o.size) || sizeOf(o.size) === size) && sameColour(o.colour, line.colour);
    const c = code(line.sku);
    if (c) {
      const exact = free.filter(({ o }) => code(o.sku) === c);
      const hit = one(exact.length > 0 ? exact.filter(fits) : free.filter(({ o }) => sameCode(code(o.sku), c)).filter(fits));
      if (hit >= 0) return hit;
    }
    return one(free.filter(({ o }) => sameName(o.title, line.title)).filter(fits).filter(({ o }) => Boolean(size) === Boolean(sizeOf(o.size))));
  };

  for (const line of invoice) {
    const at = pairFor(line);
    if (at < 0) { report.lines.push(line); report.invoiceOnly.push(line); continue; }
    used.add(at);
    const o = order[at];
    report.paired++;
    const pick = <T,>(a: T | undefined | null, b: T | undefined | null): T | undefined => {
      const empty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
      return (empty(a) ? (empty(b) ? undefined : b) : a) as T | undefined;
    };
    const merged: InvoiceLine = {
      ...o,
      ...Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === ""))),
      // What arrived and what it cost: the invoice's, always.
      quantity: line.quantity,
      costPrice: line.costPrice ?? o.costPrice,
      // The recommended retail an invoice seldom prints: the order sheet's, where the invoice has none.
      rrp: line.rrp !== null && line.rrp > 0 ? line.rrp : o.rrp,
      // The order sheet's name for the model where the two were paired by a code: an invoice's
      // line is often a shorthand ("M CARTEL X EST BK") of the form's.
      title: pick(o.title, line.title) ?? "",
      barcode: pick(line.barcode, o.barcode) ?? "",
      sku: pick(line.sku, o.sku) ?? "",
    };
    report.lines.push(merged);
    if (line.costPrice !== null && o.costPrice !== null && Math.abs(line.costPrice - o.costPrice) >= 0.01) report.costChanged.push({ line: merged, ordered: o.costPrice, invoiced: line.costPrice });
    if (line.quantity !== null && o.quantity !== null && line.quantity !== o.quantity) report.countChanged.push({ line: merged, ordered: o.quantity, invoiced: line.quantity });
  }
  report.notArrived = order.filter((o, i) => !used.has(i) && (o.quantity ?? 0) > 0);
  return report;
}

/** Which of two documents is the invoice — what arrived — and which the order sheet. */
export function invoiceFirst<T extends { filename: string; lines: InvoiceLine[] }>(a: T, b: T): [T, T] {
  const score = (d: T): number => {
    const n = d.filename.toLowerCase();
    let s = 0;
    if (/invoice|\binv\b|tax|packing|despatch|dispatch|delivery ?note|shipment|shipped/.test(n)) s += 3;
    if (/order|confirmation|\bform\b|buy|indent|pre-?season|booking/.test(n)) s -= 3;
    if (/\.pdf$|\.(jpe?g|png)$/.test(n)) s += 1;
    if (/\.(xlsx?|csv)$/.test(n)) s -= 1;
    return s;
  };
  return score(a) >= score(b) ? [a, b] : [b, a];
}

/** The report in words, for the screen. */
export function describeMerge(r: MergeReport, invoiceName: string, orderName: string): string[] {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const out = [`${n(r.paired, "line", "lines")} of ${invoiceName} paired with ${orderName}: the count and the cost are the invoice's, and anything the invoice does not say — barcode, size, colour, recommended retail — is the order sheet's.`];
  if (r.costChanged.length > 0) out.push(`${n(r.costChanged.length, "line costs", "lines cost")} something different on the invoice than on the order (${r.costChanged.slice(0, 3).map((c) => `${c.line.title}${c.line.size ? ` ${c.line.size}` : ""}: ${c.ordered.toFixed(2)} → ${c.invoiced.toFixed(2)}`).join("; ")}${r.costChanged.length > 3 ? "; …" : ""}). The invoice's cost is used.`);
  if (r.countChanged.length > 0) out.push(`${n(r.countChanged.length, "line arrived", "lines arrived")} in a different number than ordered (${r.countChanged.slice(0, 3).map((c) => `${c.line.title}${c.line.size ? ` ${c.line.size}` : ""}: ${c.ordered} ordered, ${c.invoiced} invoiced`).join("; ")}${r.countChanged.length > 3 ? "; …" : ""}). The invoice's count is used.`);
  if (r.notArrived.length > 0) out.push(`${n(r.notArrived.length, "line was", "lines were")} ordered and not on the invoice, so ${r.notArrived.length === 1 ? "it is" : "they are"} left out as not arrived: ${r.notArrived.slice(0, 4).map((l) => `${l.title}${l.size ? ` ${l.size}` : ""}`).join(", ")}${r.notArrived.length > 4 ? ", …" : ""}.`);
  if (r.invoiceOnly.length > 0) out.push(`${n(r.invoiceOnly.length, "invoice line", "invoice lines")} had nothing on the order sheet to pair with, and ${r.invoiceOnly.length === 1 ? "is" : "are"} taken as the invoice has ${r.invoiceOnly.length === 1 ? "it" : "them"}: ${r.invoiceOnly.slice(0, 4).map((l) => l.title || l.sku).join(", ")}${r.invoiceOnly.length > 4 ? ", …" : ""}.`);
  return out;
}
