/**
 * Barcodes of the kind a supplier prints: EAN-8, UPC-A, EAN-13 and GTIN-14, which all end in a
 * modulo-10 check digit. A code that fails its own check digit is not a barcode anyone scanned;
 * it is a date, a weight, a HS code or a typo that landed in the barcode column.
 */

export const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** The digits of a value that could be a GTIN, or null when it is not all digits. */
export function gtinDigits(value: string): string | null {
  const s = value.trim().replace(/^'/, "");
  return /^\d+$/.test(s) ? s : null;
}

/** Whether a value is a well-formed GTIN: the right length and the right check digit. */
export function isGtin(value: string): boolean {
  const d = gtinDigits(value);
  if (!d || !GTIN_LENGTHS.has(d.length)) return false;
  let sum = 0;
  // From the right, skipping the check digit: odd positions weigh 3, even positions 1.
  for (let i = d.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(d[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
}

export type GtinVerdict = "ok" | "bad-check-digit" | "odd-length" | "not-digits" | "empty";

/** Why a value does or does not read as a barcode. */
export function gtinVerdict(value: string): GtinVerdict {
  if (!value.trim()) return "empty";
  const d = gtinDigits(value);
  if (!d) return "not-digits";
  if (!GTIN_LENGTHS.has(d.length)) return "odd-length";
  return isGtin(d) ? "ok" : "bad-check-digit";
}
