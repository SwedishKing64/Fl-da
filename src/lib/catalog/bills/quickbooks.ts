import { escapeCsvField } from "../csv";

/**
 * A supplier's invoice as a bill for QuickBooks Online.
 *
 * The shop's bookkeeping wants each supplier invoice entered as a bill: who it is from, its
 * number and dates, what it comes to and how much of that is GST. QuickBooks Online imports
 * bills from a CSV with one row per line of the bill, the rows of one bill sharing its number —
 * Bill no., Supplier, Bill date, Due date, Terms, Location, Memo, Account, Line description,
 * Line amount, Line tax code, Line tax amount, Currency. This is that file, from what the reader
 * found on the invoice and the person corrected on screen.
 */
export interface BillLine {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  /** The line's amount before GST, as the invoice prints it. */
  amount: number | null;
  /** The GST on the line, where the invoice prints it per line. */
  gst: number | null;
  kind: "goods" | "freight" | "other";
}

export interface Bill {
  /** The file it was read from, for the screen. */
  source: string;
  supplier: string;
  billNo: string;
  /** YYYY-MM-DD where it could be read; otherwise as printed. */
  billDate: string;
  dueDate: string;
  terms: string;
  currency: string;
  gstTreatment: "INCLUSIVE" | "EXCLUSIVE" | "NONE" | "UNKNOWN";
  memo: string;
  lines: BillLine[];
  /** The printed totals: goods before GST, freight, GST, and the amount payable. */
  subtotal: number | null;
  freight: number | null;
  gst: number | null;
  total: number | null;
  unsure: string[];
}

export interface QuickBooksOptions {
  /** The expense or cost-of-sales account the goods go to, as QuickBooks names it. */
  account: string;
  /** Where freight goes; empty means the same account as the goods. */
  freightAccount: string;
  /** The tax code for lines that carry GST, and for lines that do not, as the company's QuickBooks spells them. */
  taxCode: string;
  taxFreeCode: string;
  /** One row for the whole bill (and one for freight), or a row per line of the invoice. */
  detail: "bill" | "lines";
  /** Whether Line amount carries GST in it. QuickBooks asks the same on import. */
  amounts: "exclusive" | "inclusive";
  dateFormat: "dmy" | "mdy" | "ymd";
  location: string;
}

export const DEFAULT_OPTIONS: QuickBooksOptions = {
  account: "Purchases",
  freightAccount: "Freight",
  taxCode: "GST",
  taxFreeCode: "GST free",
  detail: "bill",
  amounts: "exclusive",
  dateFormat: "dmy",
  location: "",
};

export const QUICKBOOKS_COLUMNS = ["BillNo", "Supplier", "BillDate", "DueDate", "Terms", "Location", "Memo", "Account", "LineDescription", "LineAmount", "LineTaxCode", "LineTaxAmount", "Currency"] as const;

const GST_RATE = 0.1;
const round = (n: number): number => Math.round(n * 100) / 100;
const money = (n: number | null): string => (n === null || !Number.isFinite(n) ? "" : n.toFixed(2));

/** A date as QuickBooks will read it. One it could not read stays as it was printed. */
export function qbDate(value: string, format: QuickBooksOptions["dateFormat"]): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value.trim();
  const [, y, mo, d] = m;
  return format === "dmy" ? `${d}/${mo}/${y}` : format === "mdy" ? `${mo}/${d}/${y}` : `${y}-${mo}-${d}`;
}

/** Days after the bill date the terms allow: "30 days", "Net 30", "EOM 60". Thirty when they do not say. */
export function daysOf(terms: string): number {
  const m = /(\d{1,3})\s*(days?|d\b)|net\s*(\d{1,3})|\b(\d{1,3})\s*$/i.exec(terms);
  const n = m ? Number(m[1] ?? m[3] ?? m[4]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : 30;
}

/** The due date from the bill date and the terms, where the invoice gives none. */
export function dueDateFrom(billDate: string, terms: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(billDate.trim());
  if (!m) return "";
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + daysOf(terms)));
  return at.toISOString().slice(0, 10);
}

/** The amount of a line: as printed, or the quantity by the unit price. */
export function lineAmount(line: BillLine): number | null {
  if (line.amount !== null && Number.isFinite(line.amount)) return round(line.amount);
  if (line.quantity !== null && line.unitPrice !== null) return round(line.quantity * line.unitPrice);
  return null;
}

const goodsOf = (b: Bill): number | null => {
  const lines = b.lines.filter((l) => l.kind !== "freight").map(lineAmount);
  if (b.subtotal !== null) return round(b.subtotal);
  const known = lines.filter((n): n is number => n !== null);
  if (lines.length === 0 || known.length !== lines.length) return null;
  return round(known.reduce((n, x) => n + x, 0));
};

const freightOf = (b: Bill): number => {
  if (b.freight !== null) return round(b.freight);
  return round(b.lines.filter((l) => l.kind === "freight").reduce((n, l) => n + (lineAmount(l) ?? 0), 0));
};

/** Whether this bill carries GST at all. An overseas supplier's does not. */
const taxed = (b: Bill): boolean => b.gstTreatment !== "NONE" && !(b.gst === 0 && b.total !== null && b.subtotal !== null && Math.abs(b.total - b.subtotal - freightOf(b)) < 0.05);

/**
 * What is wrong or missing, in the order a person would fix it. A bill with a problem is still
 * written, so nothing silently drops out of the file; the problem is said beside it instead.
 */
export function checkBill(b: Bill): string[] {
  const out: string[] = [];
  if (!b.supplier.trim()) out.push("No supplier name. QuickBooks needs the supplier as it is set up there.");
  if (!b.billNo.trim()) out.push("No bill number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.billDate.trim())) out.push(b.billDate.trim() ? `The bill date "${b.billDate.trim()}" is not a date that can be written out. Use YYYY-MM-DD.` : "No bill date.");
  if (b.dueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate.trim())) out.push(`The due date "${b.dueDate.trim()}" is not a date that can be written out. Use YYYY-MM-DD.`);
  const goods = goodsOf(b);
  if (goods === null) out.push("No amount: no subtotal, and a line with no amount.");
  const summed = b.lines.filter((l) => l.kind !== "freight").map(lineAmount);
  const known = summed.filter((n): n is number => n !== null);
  if (b.subtotal !== null && summed.length > 0 && known.length === summed.length) {
    const sum = round(known.reduce((n, x) => n + x, 0));
    if (Math.abs(sum - b.subtotal) > 0.05) out.push(`The lines add up to ${sum.toFixed(2)} but the subtotal reads ${b.subtotal.toFixed(2)}.`);
  }
  if (b.total !== null && goods !== null) {
    const expected = round(goods + freightOf(b) + (b.gst ?? (taxed(b) ? (goods + freightOf(b)) * GST_RATE : 0)));
    if (Math.abs(expected - b.total) > 0.05) out.push(`Goods ${goods.toFixed(2)}${freightOf(b) ? ` plus freight ${freightOf(b).toFixed(2)}` : ""} plus GST comes to ${expected.toFixed(2)}, but the total reads ${b.total.toFixed(2)}.`);
  }
  if (b.gstTreatment === "UNKNOWN") out.push("Could not tell whether the prices include GST.");
  if (b.gstTreatment === "INCLUSIVE") out.push("The invoice's prices include GST; the amounts here are taken as printed, so check the GST figure.");
  return [...out, ...b.unsure.map((u) => `Check: ${u}`)];
}

export interface QuickBooksRow { cells: string[]; bill: Bill }

/** The bill's rows for the file. */
export function quickBooksRows(b: Bill, o: QuickBooksOptions): QuickBooksRow[] {
  const dueDate = b.dueDate.trim() || dueDateFrom(b.billDate, b.terms);
  const gstOn = taxed(b);
  const code = gstOn ? o.taxCode : o.taxFreeCode;
  const head = [b.billNo.trim(), b.supplier.trim(), qbDate(b.billDate, o.dateFormat), qbDate(dueDate, o.dateFormat), b.terms.trim(), o.location.trim(), b.memo.trim()];
  const row = (account: string, description: string, exAmount: number | null, gst: number | null): QuickBooksRow => {
    const tax = exAmount === null ? null : gst !== null ? round(gst) : gstOn ? round(exAmount * GST_RATE) : 0;
    const amount = exAmount === null ? null : o.amounts === "inclusive" ? round(exAmount + (tax ?? 0)) : exAmount;
    return { cells: [...head, account, description, money(amount), code, money(tax), b.currency.trim() || "AUD"], bill: b };
  };
  const freightAccount = o.freightAccount.trim() || o.account;
  const freight = freightOf(b);
  const goods = goodsOf(b);
  if (o.detail === "lines" && b.lines.length > 0) {
    const rows = b.lines.filter((l) => l.kind !== "freight").map((l) => row(o.account, l.description.trim() || "Goods", lineAmount(l), l.gst));
    // The GST the invoice prints, when the lines did not carry their own, shared out by amount so the file agrees with the invoice.
    if (b.gst !== null && b.lines.every((l) => l.gst === null) && gstOn) {
      const base = (goods ?? 0) + freight;
      const share = base > 0 ? b.gst / base : GST_RATE;
      rows.forEach((r, i) => { const l = b.lines.filter((x) => x.kind !== "freight")[i]; const a = lineAmount(l); r.cells[11] = money(a === null ? null : round(a * share)); if (o.amounts === "inclusive" && a !== null) r.cells[9] = money(round(a + round(a * share))); });
    }
    if (freight > 0) rows.push(row(freightAccount, "Freight", freight, b.gst !== null && gstOn ? round(freight * ((b.gst) / ((goods ?? 0) + freight))) : null));
    return rows;
  }
  const gstOnGoods = b.gst === null ? null : freight > 0 && goods !== null && goods + freight > 0 ? round(b.gst * (goods / (goods + freight))) : round(b.gst);
  const rows = [row(o.account, b.memo.trim() || `${b.supplier.trim()} invoice ${b.billNo.trim()}`.trim(), goods, gstOnGoods)];
  if (freight > 0) rows.push(row(freightAccount, "Freight", freight, b.gst === null || gstOnGoods === null ? null : round(b.gst - gstOnGoods)));
  return rows;
}

/** Every bill as one file for QuickBooks. */
export function quickBooksCsv(bills: Bill[], o: QuickBooksOptions): string {
  const lines = [QUICKBOOKS_COLUMNS.join(","), ...bills.flatMap((b) => quickBooksRows(b, o).map((r) => r.cells.map(escapeCsvField).join(",")))];
  return lines.join("\r\n") + "\r\n";
}

/** A name for the file: the day it was made, and the one supplier where there is one. */
export function billsFileName(bills: Bill[], today = new Date()): string {
  const suppliers = [...new Set(bills.map((b) => b.supplier.trim().split(/\s+/)[0] ?? "").filter(Boolean))];
  const who = suppliers.length === 1 ? `-${suppliers[0].toLowerCase().replace(/[^a-z0-9]+/g, "")}` : "";
  return `quickbooks-bills${who}-${today.toISOString().slice(0, 10)}.csv`;
}
