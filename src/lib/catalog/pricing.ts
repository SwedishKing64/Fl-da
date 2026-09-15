// Pricing & Profit Engine.
//
// Everything here is pure and synchronous so it can run identically on the server (persisting
// results) and in the browser (live recalculation while a staff member edits the grid).
//
// Money flow for one unit:
//   invoice cost (any currency, any GST treatment)
//     -> ex-GST cost in AUD  (GST on purchases is an input tax credit, so it's never a cost)
//     -> + freight allocation           = LANDED COST
//     -> apply margin/markup rule       = target ex-GST sell price
//     -> + GST, round to price ending   = RETAIL PRICE (what goes into `Variant Price`)
//   ex-GST revenue = retail / (1 + GST)
//   profit         = ex-GST revenue - landed cost      <- the true figure, GST backed out

import { roundCents } from "./money";
import { discounted } from "./instructions";
import type { GstTreatment, PricingMode, RuleScope } from "./types";

export interface PricingRuleLike {
  id: string;
  name: string;
  scope: RuleScope;
  matchValue: string;
  mode: PricingMode;
  percent: number;
  roundTo: string;
  priority: number;
  active: boolean;
}

export interface PricingSettings {
  gstRate: number; // 0.1
  pricesIncludeGst: boolean;
  minMarginPct: number;
}

export interface PricingInput {
  costPrice: number; // in costCurrency, as printed on invoice
  costCurrency?: string;
  gstTreatment: GstTreatment; // how costPrice is expressed
  fxRateToAud: number; // AUD per 1 unit of costCurrency
  freightPerUnitAud: number;
  quantity: number;
  rule: PricingRuleLike | null;
  retailOverride?: number | null; // storefront price entered by staff (GST-inclusive when pricesIncludeGst)
  /** A batch-wide markdown, from a written instruction like "this is a closeout, 30% off". */
  discountPct?: number | null;
}

export interface PricingResult {
  landedCostAud: number;
  retailPrice: number; // storefront price written to CSV
  exGstRevenue: number;
  gstComponent: number;
  profitPerUnit: number;
  marginPct: number; // profit / exGstRevenue * 100
  markupPct: number; // profit / landedCost * 100
  lineProfit: number; // profitPerUnit * quantity
  lineRevenueIncGst: number;
  lowMargin: boolean;
  negativeProfit: boolean;
  ruleName: string | null;
}

export const FALLBACK_RULE: PricingRuleLike = {
  id: "fallback",
  name: "Fallback 40% margin",
  scope: "DEFAULT",
  matchValue: "",
  mode: "MARGIN",
  percent: 40,
  roundTo: "0.99",
  priority: -1000,
  active: true,
};

/** Convert an invoice cost to an ex-GST AUD figure (before freight). */
export function exGstCostAud(
  costPrice: number,
  gstTreatment: GstTreatment,
  fxRateToAud: number,
  gstRate: number,
): number {
  const exGstInCurrency = gstTreatment === "INCLUSIVE" ? costPrice / (1 + gstRate) : costPrice;
  return exGstInCurrency * (fxRateToAud || 1);
}

/** Target ex-GST sell price for a landed cost under a MARGIN or MARKUP rule. */
export function targetExGstPrice(landedCost: number, rule: PricingRuleLike): number {
  const pct = rule.percent / 100;
  if (rule.mode === "MARGIN") {
    if (pct >= 1) throw new Error("Margin rules must be below 100%");
    return landedCost / (1 - pct);
  }
  return landedCost * (1 + pct);
}

/**
 * Apply a price-ending rule, always rounding UP so the achieved margin never drops below the
 * rule's target: "0.99" => next x.99, "0.95" => next x.95, "1.00" => next whole dollar,
 * "5.00" => next multiple of $5, "NONE" => nearest cent.
 */
export function applyRounding(price: number, roundTo: string): number {
  const p = roundCents(price);
  if (p <= 0) return 0;
  switch (roundTo) {
    case "0.99":
    case "0.95": {
      const ending = Number(roundTo);
      let candidate = Math.floor(p) + ending;
      if (candidate + 1e-9 < p) candidate += 1;
      return roundCents(candidate);
    }
    case "1.00":
      return Math.ceil(p - 1e-9);
    case "5.00":
      return Math.ceil(p / 5 - 1e-9) * 5;
    case "10.00":
      return Math.ceil(p / 10 - 1e-9) * 10;
    default:
      return p;
  }
}

export function priceVariant(input: PricingInput, settings: PricingSettings): PricingResult {
  const gst = settings.gstRate;
  const rule = input.rule ?? FALLBACK_RULE;
  const qty = Math.max(0, input.quantity || 0);

  const landedCostAud = roundCents(
    exGstCostAud(input.costPrice || 0, input.gstTreatment, input.fxRateToAud, gst) +
      (input.freightPerUnitAud || 0),
  );

  let retailPrice: number;
  if (input.retailOverride !== null && input.retailOverride !== undefined && input.retailOverride >= 0) {
    retailPrice = roundCents(input.retailOverride);
  } else {
    const exGst = targetExGstPrice(landedCostAud, rule);
    const storefront = settings.pricesIncludeGst ? exGst * (1 + gst) : exGst;
    retailPrice = applyRounding(storefront, rule.roundTo);
  }

  // A closeout is a share off whatever the price would have been — off the recommended retail on a
  // line that has one, off the marked-up price on a line that does not. It is the last thing that
  // happens to the number, so the profit below is the profit on what the shop will actually take.
  retailPrice = discounted(retailPrice, input.discountPct);

  const exGstRevenue = roundCents(settings.pricesIncludeGst ? retailPrice / (1 + gst) : retailPrice);
  const gstComponent = roundCents(settings.pricesIncludeGst ? retailPrice - exGstRevenue : retailPrice * gst);
  const profitPerUnit = roundCents(exGstRevenue - landedCostAud);
  const marginPct = exGstRevenue > 0 ? (profitPerUnit / exGstRevenue) * 100 : 0;
  const markupPct = landedCostAud > 0 ? (profitPerUnit / landedCostAud) * 100 : 0;

  return {
    landedCostAud,
    retailPrice,
    exGstRevenue,
    gstComponent,
    profitPerUnit,
    marginPct: round1(marginPct),
    markupPct: round1(markupPct),
    lineProfit: roundCents(profitPerUnit * qty),
    lineRevenueIncGst: roundCents((settings.pricesIncludeGst ? retailPrice : retailPrice * (1 + gst)) * qty),
    lowMargin: marginPct < settings.minMarginPct,
    negativeProfit: profitPerUnit < 0,
    ruleName: rule.name,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RuleContext {
  category: string;
  brand: string;
  sku: string;
  modelCode: string;
}

const SCOPE_RANK: Record<RuleScope, number> = { PRODUCT: 3, BRAND: 2, CATEGORY: 1, DEFAULT: 0 };

/** Most specific active rule wins (PRODUCT > BRAND > CATEGORY > DEFAULT), then highest priority. */
export function selectRule(rules: PricingRuleLike[], ctx: RuleContext): PricingRuleLike | null {
  const norm = (s: string) => (s || "").trim().toLowerCase();
  const candidates = rules.filter((r) => {
    if (!r.active) return false;
    const mv = norm(r.matchValue);
    switch (r.scope) {
      case "DEFAULT":
        return true;
      case "CATEGORY":
        return mv !== "" && mv === norm(ctx.category);
      case "BRAND":
        return mv !== "" && mv === norm(ctx.brand);
      case "PRODUCT":
        return mv !== "" && (mv === norm(ctx.sku) || mv === norm(ctx.modelCode));
      default:
        return false;
    }
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] || b.priority - a.priority);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Freight allocation
// ---------------------------------------------------------------------------

export interface FreightLine {
  id: string;
  quantity: number;
  exGstCostAud: number; // per unit, before freight
}

/**
 * Allocate a batch-level freight total across units. PER_UNIT splits evenly per unit;
 * BY_VALUE splits pro-rata by ex-GST cost value. Returns per-unit freight per line id.
 */
export function allocateFreight(
  totalAud: number,
  mode: "PER_UNIT" | "BY_VALUE",
  lines: FreightLine[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!totalAud || totalAud <= 0 || lines.length === 0) {
    for (const l of lines) out[l.id] = 0;
    return out;
  }
  if (mode === "BY_VALUE") {
    const totalValue = lines.reduce((s, l) => s + Math.max(0, l.exGstCostAud) * Math.max(0, l.quantity), 0);
    if (totalValue <= 0) return allocateFreight(totalAud, "PER_UNIT", lines);
    for (const l of lines) {
      const lineShare = (Math.max(0, l.exGstCostAud) * Math.max(0, l.quantity)) / totalValue;
      out[l.id] = l.quantity > 0 ? roundCents((totalAud * lineShare) / l.quantity) : 0;
    }
    return out;
  }
  const totalUnits = lines.reduce((s, l) => s + Math.max(0, l.quantity), 0);
  const perUnit = totalUnits > 0 ? roundCents(totalAud / totalUnits) : 0;
  for (const l of lines) out[l.id] = l.quantity > 0 ? perUnit : 0;
  return out;
}

// ---------------------------------------------------------------------------
// Batch roll-up
// ---------------------------------------------------------------------------

export interface BatchSummary {
  units: number;
  variants: number;
  totalRetailIncGst: number; // total goods value at retail, GST-inclusive
  totalGst: number; // GST collected on that revenue
  totalExGstRevenue: number;
  totalLandedCost: number;
  totalNetProfit: number; // Σ ex-GST revenue − Σ landed cost
  averageMarginPct: number; // profit / ex-GST revenue, weighted by units
  lowMarginVariants: number;
}

export function summariseBatch(
  rows: Array<{ quantity: number; result: PricingResult }>,
): BatchSummary {
  let units = 0;
  let totalRetailIncGst = 0;
  let totalGst = 0;
  let totalExGstRevenue = 0;
  let totalLandedCost = 0;
  let lowMarginVariants = 0;
  for (const { quantity, result } of rows) {
    const q = Math.max(0, quantity || 0);
    units += q;
    totalRetailIncGst += result.lineRevenueIncGst;
    totalGst += result.gstComponent * q;
    totalExGstRevenue += result.exGstRevenue * q;
    totalLandedCost += result.landedCostAud * q;
    if (result.lowMargin) lowMarginVariants++;
  }
  const totalNetProfit = roundCents(totalExGstRevenue - totalLandedCost);
  return {
    units,
    variants: rows.length,
    totalRetailIncGst: roundCents(totalRetailIncGst),
    totalGst: roundCents(totalGst),
    totalExGstRevenue: roundCents(totalExGstRevenue),
    totalLandedCost: roundCents(totalLandedCost),
    totalNetProfit,
    averageMarginPct: totalExGstRevenue > 0 ? round1((totalNetProfit / totalExGstRevenue) * 100) : 0,
    lowMarginVariants,
  };
}
