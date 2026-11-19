/**
 * Arithmetic for the price calculator, and for nothing else.
 *
 * "What would I have to charge for a 45% margin?" is a fair question to ask while deciding what to
 * buy. It is not a way to decide what to sell at — the supplier's recommended retail settles that,
 * and pricing.ts has no idea these functions exist.
 *
 * They live here, apart from the pricing engine, so they cannot creep back into it. Nothing in the
 * import, review or export path imports this file.
 */

export type CalculatorMode = "MARGIN" | "MARKUP";

/** The ex-GST price a margin or a markup on this landed cost would ask for. */
export function targetExGstPrice(landedCost: number, mode: CalculatorMode, percent: number): number {
  const pct = percent / 100;
  if (mode === "MARGIN") {
    if (pct >= 1) throw new Error("Margin must be below 100%");
    return landedCost / (1 - pct);
  }
  return landedCost * (1 + pct);
}

/**
 * Apply a price-ending rule, always rounding UP so the achieved margin never drops below the one
 * asked for: "0.99" => next x.99, "0.95" => next x.95, "1.00" => next whole dollar, "5.00" => next
 * multiple of $5, "NONE" => nearest cent.
 */
export function applyRounding(value: number, roundTo: string): number {
  const cents = (n: number) => Math.round(n * 100) / 100;
  if (roundTo === "NONE" || !roundTo) return cents(value);
  if (roundTo === "1.00") return Math.ceil(value - 1e-9);
  const step = Number(roundTo);
  if (!Number.isFinite(step) || step <= 0) return cents(value);
  if (step >= 1) return Math.ceil(value / step - 1e-9) * step;
  // An ending like .99 or .95: the next whole dollar carrying that ending.
  const base = Math.floor(value);
  const candidate = cents(base + step);
  return candidate + 1e-9 >= value ? candidate : cents(base + 1 + step);
}

/** What the calculator would charge, GST added where the storefront shows GST-inclusive prices. */
export function retailFor(
  landedCostHome: number,
  mode: CalculatorMode,
  percent: number,
  roundTo: string,
  settings: { gstRate: number; pricesIncludeGst: boolean },
): number {
  const exGst = targetExGstPrice(landedCostHome, mode, percent);
  const storefront = settings.pricesIncludeGst ? exGst * (1 + settings.gstRate) : exGst;
  return applyRounding(storefront, roundTo);
}
