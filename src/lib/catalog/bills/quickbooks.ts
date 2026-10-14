/**
 * A supplier's invoice as a bill for QuickBooks Online.
 *
 * The shop's bookkeeping wants each supplier invoice entered as a bill: who it is from, its
 * number and dates, what it comes to and how much of that is GST. The shop gave the sheet it
 * imports into QuickBooks Online: one row per bill — Supplier, Bill no., Bill date, Due date,
 * Category, Description, Amount, GST — the amount being the whole invoice with GST in it, freight
 * included, and the category "Cost of sales:Stock Purchase". This is that sheet, from what the
 * reader found on the invoice and the person corrected on screen.
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
  /** The supplier's name as the invoice printed it, where the shop's supplier list renamed it. */
  printedSupplier?: string;
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
  /** The account the bill goes to, as QuickBooks names it: "Cost of sales:Stock Purchase". */
  category: string;
}

export const DEFAULT_OPTIONS: QuickBooksOptions = { category: "Cost of sales:Stock Purchase" };

/** The shop's own bill sheet, heading for heading — "Amount " carries the trailing space it has there. */
export const QUICKBOOKS_COLUMNS = ["Supplier", "Bill no.", "Bill date", "Due date", "Category", "Description", "Amount ", "GST"] as const;

const GST_RATE = 0.1;
const round = (n: number): number => Math.round(n * 100) / 100;

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

/** The GST on the bill: as printed, or worked out from what the invoice says about GST. */
export function gstOf(b: Bill): number {
  if (b.gst !== null && Number.isFinite(b.gst)) return round(b.gst);
  if (!taxed(b)) return 0;
  if (b.gstTreatment === "INCLUSIVE" && b.total !== null) return round(b.total / 11);
  return round(((goodsOf(b) ?? 0) + freightOf(b)) * GST_RATE);
}

/** What the bill comes to with GST in it: the amount payable as printed, or the goods, freight and GST added up. */
export function amountOf(b: Bill): number | null {
  if (b.total !== null && Number.isFinite(b.total)) return round(b.total);
  const goods = goodsOf(b);
  if (goods === null) return null;
  return round(goods + freightOf(b) + (b.gstTreatment === "INCLUSIVE" ? 0 : gstOf(b)));
}

export interface QuickBooksRow {
  supplier: string;
  /** A plain number where the invoice's number is one, as the shop's sheet holds it. */
  billNo: string | number;
  /** YYYY-MM-DD, or as printed where it could not be read. */
  billDate: string;
  dueDate: string;
  category: string;
  description: string;
  amount: number | null;
  gst: number;
}

/** The bill as one row of the shop's sheet: the whole invoice, freight and all, GST in the amount. */
export function quickBooksRow(b: Bill, o: QuickBooksOptions): QuickBooksRow {
  const no = b.billNo.trim();
  return {
    supplier: b.supplier.trim(),
    billNo: /^[1-9]\d{0,14}$/.test(no) ? Number(no) : no,
    billDate: b.billDate.trim(),
    dueDate: b.dueDate.trim() || dueDateFrom(b.billDate, b.terms),
    category: o.category.trim() || DEFAULT_OPTIONS.category,
    description: "",
    amount: amountOf(b),
    gst: gstOf(b),
  };
}

const asDate = (value: string): Date | string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : value;
};

/** Every bill as the shop's QuickBooks sheet: one row each, dates as dates, money to two places. */
export async function quickBooksWorkbook(bills: Bill[], o: QuickBooksOptions): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Sheet1");
  sheet.columns = [17, 10, 10.71, 10.71, 26.29, 11.14, 10.71, 9.14].map((width) => ({ width }));
  sheet.addRow([...QUICKBOOKS_COLUMNS]);
  for (const b of bills) {
    const r = quickBooksRow(b, o);
    sheet.addRow([r.supplier, r.billNo, asDate(r.billDate), asDate(r.dueDate), r.category, r.description || null, r.amount, r.gst]);
  }
  sheet.eachRow((row, n) => {
    for (const col of [3, 4]) if (row.getCell(col).value instanceof Date) row.getCell(col).numFmt = "mm-dd-yy";
    for (const col of [7, 8]) if (n === 1 || typeof row.getCell(col).value === "number") row.getCell(col).numFmt = "0.00";
  });
  return (await book.xlsx.writeBuffer()) as ArrayBuffer;
}

/** A name for the file: the day it was made, and the one supplier where there is one. */
export function billsFileName(bills: Bill[], today = new Date()): string {
  const suppliers = [...new Set(bills.map((b) => b.supplier.trim().split(/\s+/)[0] ?? "").filter(Boolean))];
  const who = suppliers.length === 1 ? `-${suppliers[0].toLowerCase().replace(/[^a-z0-9]+/g, "")}` : "";
  return `quickbooks-bills${who}-${today.toISOString().slice(0, 10)}.xlsx`;
}
