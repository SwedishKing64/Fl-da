/**
 * A supplier document with its money disguised, so a pilot shop can share real paperwork without
 * sharing what it pays.
 *
 * Every amount is multiplied by one factor, chosen at random per document and never written down:
 * the layout, the codes, the quantities and the arithmetic all stay as they were — a line still
 * comes to its line total, the lines still come to the subtotal — but no figure is the real one.
 * Quantities, codes and barcodes are whole numbers in columns that are not money, and are left be.
 */

/** Headings of columns that hold money. */
const MONEY_HEADING = /\b(price|cost|rrp|msrp|srp|retail|wholesale|whsl?|w\/s|net|total|amount|value|subtotal|dealer|trade|each|unit\s*\$|\$|eur|usd|aud|nzd|gbp)\b|[$€£]/i;

/** Headings that look like money but are not: a quantity, a percentage, a code. */
const NOT_MONEY = /\b(qty|quantity|units|pcs|disc(ount)?\s*%|%|code|sku|ean|upc|barcode|no\.?|number|ref)\b/i;

/** A disguising factor: well away from 1 either way, so no figure stays near its real value. */
export function disguiseFactor(random: () => number = Math.random): number {
  const r = random();
  const factor = r < 0.5 ? 0.55 + r * 0.6 : 1.15 + (r - 0.5) * 0.6;
  return Math.round(factor * 1000) / 1000;
}

/** An amount as written — "$1,649.00", "1649", "189.5" — scaled, and written back the same way. */
export function scaleAmount(written: string, factor: number): string {
  const m = /^(\s*[-(]?\s*)([$€£]?\s*)([\d,]*\d(?:\.\d+)?)(\s*[)]?\s*)$/.exec(written);
  if (!m) return written;
  const [, before, symbol, number, after] = m;
  const value = Number(number.replace(/,/g, ""));
  if (!Number.isFinite(value)) return written;
  const decimals = number.includes(".") ? number.split(".")[1].length : 0;
  const scaled = value * factor;
  // A whole-number price stays whole; one written to cents keeps its cents.
  const out = decimals === 0 ? String(Math.round(scaled)) : scaled.toFixed(Math.max(2, decimals));
  const grouped = number.includes(",") ? Number(out).toLocaleString("en-US", { minimumFractionDigits: decimals ? Math.max(2, decimals) : 0, maximumFractionDigits: decimals ? Math.max(2, decimals) : 0 }) : out;
  return `${before}${symbol}${grouped}${after}`;
}

/** Whether a heading names a money column. */
export function isMoneyHeading(heading: string): boolean {
  const h = heading.trim();
  return h !== "" && MONEY_HEADING.test(h) && !NOT_MONEY.test(h);
}

/** The row that heads the columns: the first with three or more cells that read as headings. */
export function headingRow(grid: string[][]): number {
  const heading = /^[a-z][a-z /&#%$().'-]{1,40}$/i;
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    if (grid[i].filter((c) => heading.test(c.trim())).length >= 3) return i;
  }
  return -1;
}

/** An amount printed with its currency symbol or to the cent, wherever it sits: a subtotal, a freight line. */
const PRINTED_AMOUNT = /[$€£]\s*[\d,]*\d(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+\.\d{2}\b|\b\d+\.\d{2}\b/g;

/** A sheet with its money disguised: every cell under a money heading, and any amount printed to the cent elsewhere. */
export function disguiseGrid(grid: string[][], factor: number): string[][] {
  const head = headingRow(grid);
  const money = new Set(head < 0 ? [] : grid[head].map((c, i) => (isMoneyHeading(c) ? i : -1)).filter((i) => i >= 0));
  return grid.map((row, r) => row.map((cell, c) => {
    if (r <= head) return cell;
    if (money.has(c)) return scaleAmount(cell, factor);
    return disguiseText(cell, factor);
  }));
}

/** Text with its amounts disguised: those with a currency symbol, and those written to the cent. */
export function disguiseText(text: string, factor: number): string {
  return text.replace(PRINTED_AMOUNT, (amount) => scaleAmount(amount, factor));
}
