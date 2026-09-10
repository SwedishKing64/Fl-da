/** Round to cents using half-up rounding, tolerant of binary float noise. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return (sign * Math.round((abs + 1e-9) * 100)) / 100;
}

/** Format a number as a plain decimal with 2dp and no currency symbol (Shopify CSV format). */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return roundCents(value).toFixed(2);
}

/**
 * Parse a price string from an invoice: strips currency symbols, thousands separators and
 * whitespace; accepts "1,234.50", "$1,234.50", "1.234,50" (EU), "(12.00)" negatives.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[A-Za-z$€£¥\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  // EU format "1.234,50" => "1234.50"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseIntSafe(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  const m = String(input).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  return Math.round(Number(m[0]));
}
