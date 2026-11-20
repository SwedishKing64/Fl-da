/**
 * What stops a push and what only warns: the shop's choice, check by check.
 *
 * One shop refuses to push a product without a barcode; another sells vintage and has none. A
 * check that is an error blocks a push to Shopify and heads the export page's list; one that
 * is a warning is shown and can be pushed over with the override. The CSV export never stops
 * for either: the shop asked that nothing does. Each check here has Snaben's default, and the
 * shop's setting (`settings.checks`) overrides it. The checks not listed keep their severity:
 * a duplicate handle or an ambiguous match would break the store, so they always block.
 *
 * Pure: the settings are handed in.
 */

export type CheckMode = "block" | "warn";

export interface CheckDef {
  code: string;
  /** The check, as a sentence fragment: "a barcode that fails its check digit". */
  what: string;
  byDefault: CheckMode;
}

export const CHECKS: CheckDef[] = [
  { code: "INVALID_BARCODE", what: "a barcode that fails its check digit", byDefault: "block" },
  { code: "MISSING_BARCODE", what: "a variant with no barcode", byDefault: "warn" },
  { code: "SWAPPED_CODES", what: "a SKU and barcode in each other's columns", byDefault: "block" },
  { code: "NEGATIVE_PROFIT", what: "a retail price below the cost", byDefault: "block" },
  { code: "UNKNOWN_TYPE", what: "a product type that is not one of the shop's", byDefault: "block" },
  { code: "NO_IMAGE", what: "a product with no picture", byDefault: "warn" },
  { code: "MISSING_PRICE", what: "a variant with no retail price", byDefault: "warn" },
  { code: "MISSING_COST", what: "a variant with no cost", byDefault: "warn" },
  { code: "MISSING_VENDOR", what: "a product with no brand", byDefault: "warn" },
  { code: "MISSING_TYPE", what: "a product with no product type", byDefault: "warn" },
];

export type CheckSettings = Partial<Record<string, CheckMode>>;

/** The settings made safe: only known checks, only the two modes. */
export function cleanChecks(input: unknown): CheckSettings {
  const out: CheckSettings = {};
  if (!input || typeof input !== "object") return out;
  for (const [code, mode] of Object.entries(input as Record<string, unknown>)) {
    if (CHECKS.some((c) => c.code === code) && (mode === "block" || mode === "warn")) out[code] = mode;
  }
  return out;
}

/** How a check is treated for this shop. Null for a check the shop cannot change. */
export function modeFor(code: string, settings: CheckSettings = {}): CheckMode | null {
  const def = CHECKS.find((c) => c.code === code);
  if (!def) return null;
  return settings[code] ?? def.byDefault;
}

/** The flag's severity under the shop's settings, or its own where the shop has no say. */
export function severityFor(code: string, own: "error" | "warning", settings: CheckSettings = {}): "error" | "warning" {
  const mode = modeFor(code, settings);
  if (!mode) return own;
  return mode === "block" ? "error" : "warning";
}

/** Each check as a sentence: what it does for this shop, and whether that is the shop's choice. */
export function describeChecks(settings: CheckSettings = {}): Array<{ code: string; sentence: string; mode: CheckMode; own: boolean }> {
  return CHECKS.map((c) => {
    const mode = settings[c.code] ?? c.byDefault;
    const what = c.what[0].toUpperCase() + c.what.slice(1);
    return { code: c.code, mode, own: settings[c.code] !== undefined, sentence: mode === "block" ? `${what} stops a push until it is fixed.` : `${what} is a warning: shown, and pushed over with the override.` };
  });
}
