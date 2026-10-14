/**
 * A scanned batch of invoices put back together, one bill per invoice.
 *
 * The shop scans a day's invoices into one PDF — several suppliers, some invoices one page, some
 * three — and wants one row per invoice. Each page is read on its own (a whole batch is far too
 * big to send at once), and each reading says what the page itself shows: the supplier, the
 * invoice number, whether it is the first page of an invoice, and any "Page 2 of 3". This puts
 * consecutive pages of one invoice together.
 *
 * A page joins the invoice before it when it carries the same invoice number, when it says it is
 * page 2 or later, or when it has no number and does not look like a first page. A different
 * invoice number, or a fresh first page, starts the next. Header details come from the first page
 * that prints them; the totals from the last, which is where an invoice prints them.
 */

import type { Bill } from "./quickbooks";
import type { PageMark } from "./read-bill";

export interface ReadPage {
  bill: Bill;
  mark: PageMark;
  /** The page's number in the batch, from 1. */
  page: number;
}

/** An invoice number to compare by: case, spaces, dashes and a leading "INV" or "#" aside. */
export const sameNumber = (a: string, b: string): boolean => {
  const norm = (s: string) => s.toUpperCase().replace(/^(INV(OICE)?|NO\.?|#)\s*/, "").replace(/[\s\-_/.#]/g, "").replace(/^0+/, "");
  return norm(a) !== "" && norm(a) === norm(b);
};

/** Whether a page has anything of an invoice on it at all. A blank or a cover sheet has not. */
const empty = (b: Bill): boolean => !b.supplier && !b.billNo && b.lines.length === 0 && b.subtotal === null && b.gst === null && b.total === null;

/** An invoice being put together: its pages so far, its number once a page has shown it, and the last page's mark. */
interface Group { pages: ReadPage[]; billNo: string; last: PageMark }

/** Whether this page carries on the invoice in hand rather than starting another. */
function carriesOn(current: Group, p: ReadPage): boolean {
  const { bill, mark } = p;
  if (bill.billNo && current.billNo) return sameNumber(bill.billNo, current.billNo);
  if (mark.printedPage !== null && mark.printedPage > 1) return true;
  if (mark.printedPage === 1) return false;
  // The page before said it was the last of its invoice.
  if (current.last.printedPage !== null && current.last.printedPages !== null && current.last.printedPage >= current.last.printedPages) return false;
  if (empty(bill)) return true;
  return !mark.startsInvoice;
}

const pages = (from: number, to: number) => (from === to ? `p.${from}` : `pp.${from}–${to}`);

/** The pages of one invoice as one bill. */
function merge(source: string, group: ReadPage[]): Bill {
  const first = <K extends keyof Bill>(key: K): Bill[K] => (group.find((p) => p.bill[key])?.bill[key] ?? group[0].bill[key]);
  const last = (key: "subtotal" | "freight" | "gst" | "total"): number | null => {
    for (let i = group.length - 1; i >= 0; i--) if (group[i].bill[key] !== null) return group[i].bill[key];
    return null;
  };
  const treatment = group.map((p) => p.bill.gstTreatment).find((t) => t !== "UNKNOWN") ?? "UNKNOWN";
  return {
    source: `${source} ${pages(group[0].page, group[group.length - 1].page)}`,
    supplier: first("supplier"),
    billNo: first("billNo"),
    billDate: first("billDate"),
    dueDate: first("dueDate"),
    terms: first("terms"),
    currency: group.map((p) => p.bill.currency).find((c) => c && c !== "AUD") ?? "AUD",
    gstTreatment: treatment,
    memo: first("memo"),
    lines: group.flatMap((p) => p.bill.lines),
    subtotal: last("subtotal"),
    freight: last("freight"),
    gst: last("gst"),
    total: last("total"),
    unsure: [...new Set(group.flatMap((p) => p.bill.unsure))],
  };
}

/** The pages of a batch, in order, as one bill per invoice. Pages with nothing on them are dropped. */
export function groupPages(source: string, read: ReadPage[]): Bill[] {
  const groups: Group[] = [];
  for (const p of [...read].sort((a, b) => a.page - b.page)) {
    const current = groups.at(-1);
    if (current && carriesOn(current, p)) {
      current.pages.push(p);
      current.billNo ||= p.bill.billNo;
      current.last = p.mark;
    } else if (!empty(p.bill)) {
      groups.push({ pages: [p], billNo: p.bill.billNo, last: p.mark });
    }
  }
  return groups.map((g) => merge(source, g.pages));
}
