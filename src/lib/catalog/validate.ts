// Row-level validation for the review grid. Pure: takes the review view + settings and
// returns flags per product / variant. Errors block export; warnings can be overridden.

import { isPublicHttpsUrl } from "./csv";
import { gtinVerdict, isGtin } from "./gtin";
import { describeCandidates } from "./match-candidates";
import { houseConventions, isValidType, typesAreKnown } from "./taxonomy";
import { isValidHandle } from "./handle";
import type { ReviewProduct, ReviewSummary, ReviewVariant } from "./review-types";
import { HARD_CODES, type RowFlag } from "./types";

/**
 * How many photographs a product should carry. The shop's own catalogue is mostly short of this —
 * 352 of its 705 products have a single image — so it is what to aim at, not what it does today.
 */
export const MIN_IMAGES = 6;
export const MAX_IMAGES = 8;

export interface ValidationContext {
  minMarginPct: number;
  /** A margin above this is not a price, it is a cost in the wrong column. Default 80. */
  /** Lower-cased SKUs that already exist in the live Shopify catalog, mapped to their handle. */
  shopifySkus?: Map<string, string>;
  /** Handles that already exist in the live Shopify catalog. */
  shopifyHandles?: Set<string>;
}

export function validateReview(products: ReviewProduct[], ctx: ValidationContext): void {
  const handleCounts = new Map<string, number>();
  const skuCounts = new Map<string, number>();
  for (const p of products) {
    handleCounts.set(p.handle, (handleCounts.get(p.handle) ?? 0) + 1);
    for (const v of p.variants) {
      const sku = v.sku.trim().toLowerCase();
      if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    }
  }

  for (const p of products) {
    const flags: RowFlag[] = [];
    if (!p.title.trim()) flags.push({ code: "MISSING_TITLE", severity: "error", message: "Product has no title" });
    if (!p.handle || !isValidHandle(p.handle)) flags.push({ code: "INVALID_HANDLE", severity: "error", message: "Handle must be lowercase letters, numbers and hyphens" });
    else if ((handleCounts.get(p.handle) ?? 0) > 1) flags.push({ code: "DUPLICATE_HANDLE", severity: "error", message: "Another product in this batch uses the same handle" });
    if (!p.vendor.trim()) flags.push({ code: "MISSING_VENDOR", severity: "warning", message: "No vendor/brand" });
    if (!p.productType.trim()) flags.push({ code: "MISSING_TYPE", severity: "warning", message: "No product type" });
    // Once the shop has said what its kinds of product are (its website's categories, its export),
    // a Type outside that list is a place on the site that does not exist. It is never written.
    else if (typesAreKnown() && !isValidType(p.productType)) flags.push({ code: "UNKNOWN_TYPE", severity: "error", message: `"${p.productType.trim()}" is not one of your kinds of product — pick one from the list` });
    const validImages = p.images.filter((i) => isPublicHttpsUrl(i.url));
    if (p.images.length === 0) flags.push({ code: "NO_IMAGE", severity: "warning", message: "No image - add one or export anyway" });
    else {
      if (validImages.length < p.images.length) flags.push({ code: "INVALID_IMAGE_URL", severity: "warning", message: "An image URL is not a public HTTPS link" });
      // The shop wants six to eight photographs on a product, taken from the supplier's own site.
      // Where a model is too old or too new to be on there they come out of the supplier's
      // catalogue by hand, so this is a nudge to go and find the rest rather than a blocker.
      if (validImages.length < MIN_IMAGES) {
        flags.push({
          code: "FEW_IMAGES",
          severity: "warning",
          message: `Only ${validImages.length} image${validImages.length === 1 ? "" : "s"} - the shop wants ${MIN_IMAGES}-${MAX_IMAGES} from the supplier's site`,
        });
      }
    }
    if (p.reconcileStatus === "AMBIGUOUS") {
      flags.push({ code: "AMBIGUOUS_MATCH", severity: "error", message: describeCandidates(p.matchCandidates) });
    } else if (p.reconcileStatus === "UPDATE" || p.reconcileStatus === "VARIANT_ADD") {
      flags.push({ code: "UPDATE_EXISTING", severity: "warning", message: p.reconcileStatus === "UPDATE" ? "Exists in Shopify - export will update the live product" : "Adds variants to an existing Shopify product" });
    } else if (ctx.shopifyHandles?.has(p.handle) && p.reconcileStatus === "UNKNOWN") {
      flags.push({ code: "UPDATE_EXISTING", severity: "warning", message: "A product with this handle already exists in Shopify" });
    }
    p.flags = flags;

    const combos = new Map<string, number>();
    for (const v of p.variants) {
      const combo = [v.option1Value, v.option2Value, v.option3Value].map((s) => (s ?? "").trim().toLowerCase()).join("|");
      combos.set(combo, (combos.get(combo) ?? 0) + 1);
    }
    for (const v of p.variants) {
      const vf: RowFlag[] = [];
      const dismissed = new Set(v.warningsDismissed);
      // Said, not enforced. Nothing invents a price, but a missing one is not a reason to refuse
      // the export either: the column goes out empty, which leaves Shopify's own price alone, and
      // it is quicker to fill a handful in there than to be held up here.
      if (!(v.retailPrice > 0)) vf.push({ code: "MISSING_PRICE", severity: "warning", message: "No recommended retail — the price column will be empty, to fill in Shopify or here" });
      if (!(v.costPrice > 0)) vf.push({ code: "MISSING_COST", severity: "warning", message: "No cost price - profit cannot be calculated" });
      const sku = v.sku.trim().toLowerCase();
      if (!sku && houseConventions().identifiers.sku !== "none") vf.push({ code: "MISSING_SKU", severity: "warning", message: "No SKU" });
      if (!v.barcode.trim() && houseConventions().identifiers.barcode === "required") vf.push({ code: "MISSING_BARCODE", severity: "warning", message: "No barcode, and the shop puts one on every variant" });
      if (sku && (skuCounts.get(sku) ?? 0) > 1) vf.push({ code: "DUPLICATE_SKU_BATCH", severity: "error", message: "SKU appears more than once in this batch" });
      const liveHandle = sku ? ctx.shopifySkus?.get(sku) : undefined;
      if (liveHandle && v.reconcileStatus !== "UPDATE") vf.push({ code: "DUPLICATE_SKU_SHOPIFY", severity: "warning", message: `SKU already exists in Shopify (${liveHandle})` });
      // A barcode is a number with a check digit. One that fails its own check digit was never
      // scanned off a product: it is a date, a weight or a typo in the barcode column. And when
      // the SKU column holds a good barcode while the barcode column does not, the two columns
      // are the wrong way round — one of the five things a new layout gets wrong.
      const barcodeVerdict = gtinVerdict(v.barcode);
      if (isGtin(v.sku) && barcodeVerdict !== "ok") vf.push({ code: "SWAPPED_CODES", severity: "error", message: `The SKU (${v.sku.trim()}) is a barcode and the barcode column is not — the two columns look swapped` });
      else if (barcodeVerdict === "bad-check-digit") vf.push({ code: "INVALID_BARCODE", severity: "error", message: `${v.barcode.trim()} is not a barcode: its check digit is wrong` });
      else if (barcodeVerdict === "odd-length") vf.push({ code: "ODD_BARCODE", severity: "warning", message: `${v.barcode.trim()} is ${v.barcode.trim().replace(/^'/, "").length} digits — a barcode is 8, 12, 13 or 14` });
      if (p.option1Name) {
        const missing = [p.option1Name && !v.option1Value?.trim(), p.option2Name && !v.option2Value?.trim(), p.option3Name && !v.option3Value?.trim()].some(Boolean);
        if (missing) vf.push({ code: "MISSING_OPTION_VALUE", severity: "error", message: "Missing an option value" });
        const combo = [v.option1Value, v.option2Value, v.option3Value].map((s) => (s ?? "").trim().toLowerCase()).join("|");
        if ((combos.get(combo) ?? 0) > 1) vf.push({ code: "DUPLICATE_OPTIONS", severity: "error", message: "Two variants share the same option values" });
      }
      // A price below the landed cost is a cost that landed in the price column or a list price
      // that landed in the cost column. The number on the shop would be wrong, so it stops the
      // export rather than warns. A thin margin is only a warning.
      if (v.profitPerUnit < 0 && v.retailPrice > 0) vf.push({ code: "NEGATIVE_PROFIT", severity: "error", message: `Selling below landed cost (${v.retailPrice.toFixed(2)} against ${v.landedCostAud.toFixed(2)}) — a cost in the price column?` });
      else if (v.retailPrice > 0 && v.costPrice > 0 && v.marginPct < ctx.minMarginPct) vf.push({ code: "LOW_MARGIN", severity: "warning", message: `Margin ${v.marginPct.toFixed(1)}% is below ${ctx.minMarginPct}%` });
      v.flags = vf.filter((f) => f.severity === "error" || !dismissed.has(f.code));
    }
  }
}

export function summarise(products: ReviewProduct[]): ReviewSummary {
  let units = 0, variants = 0, totalRetailIncGst = 0, totalGst = 0, totalExGstRevenue = 0, totalLandedCost = 0, lowMarginVariants = 0, errors = 0, warnings = 0;
  for (const p of products) {
    for (const f of p.flags) {
      if (f.severity === "error") errors++;
      else warnings++;
    }
    for (const v of p.variants) {
      variants++;
      const q = Math.max(0, v.quantity);
      units += q;
      totalRetailIncGst += v.retailPrice * q;
      totalGst += v.gstComponent * q;
      totalExGstRevenue += v.exGstRevenue * q;
      totalLandedCost += v.landedCostAud * q;
      if (v.flags.some((f) => f.code === "LOW_MARGIN" || f.code === "NEGATIVE_PROFIT")) lowMarginVariants++;
      for (const f of v.flags) {
        if (f.severity === "error") errors++;
        else warnings++;
      }
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const totalNetProfit = r2(totalExGstRevenue - totalLandedCost);
  return {
    units,
    variants,
    products: products.length,
    totalRetailIncGst: r2(totalRetailIncGst),
    totalGst: r2(totalGst),
    totalExGstRevenue: r2(totalExGstRevenue),
    totalLandedCost: r2(totalLandedCost),
    totalNetProfit,
    averageMarginPct: totalExGstRevenue > 0 ? Math.round((totalNetProfit / totalExGstRevenue) * 1000) / 10 : 0,
    lowMarginVariants,
    errors,
    warnings,
  };
}

export function blockingErrors(products: ReviewProduct[]): string[] {
  const out: string[] = [];
  for (const p of products) {
    for (const f of p.flags) if (f.severity === "error") out.push(`${p.title || p.handle}: ${f.message}`);
    for (const v of p.variants) for (const f of v.flags) if (f.severity === "error") out.push(`${p.title || p.handle} / ${v.sku || "(no sku)"}: ${f.message}`);
  }
  return out;
}

/**
 * The errors the export cannot repair, so they stop it: a wrong barcode, swapped code columns, a
 * price below cost, a margin no shop earns. Each names the product and variant to go and fix.
 */
export function hardErrors(products: ReviewProduct[]): string[] {
  const hard = new Set<string>(HARD_CODES);
  const out: string[] = [];
  for (const p of products) {
    for (const f of p.flags) if (hard.has(f.code)) out.push(`${p.title || p.handle}: ${f.message}`);
    for (const v of p.variants) for (const f of v.flags) if (hard.has(f.code)) out.push(`${p.title || p.handle} / ${v.sku || v.option1Value || "(no sku)"}: ${f.message}`);
  }
  return out;
}

export function warningList(products: ReviewProduct[]): string[] {
  const out: string[] = [];
  for (const p of products) {
    for (const f of p.flags) if (f.severity === "warning") out.push(`${p.title || p.handle}: ${f.message}`);
    for (const v of p.variants) for (const f of v.flags) if (f.severity === "warning") out.push(`${p.title || p.handle} / ${v.sku || "(no sku)"}: ${f.message}`);
  }
  return out;
}

export function emptyVariantView(partial: Partial<ReviewVariant> & { id: string; productId: string }): ReviewVariant {
  return {
    sku: "", barcode: "", option1Value: null, option2Value: null, option3Value: null, grams: 0, quantity: 0,
    costPrice: 0, costCurrency: "AUD", gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0,
    pricingRuleId: null, pricingRuleName: null, retailOverride: null, compareAtPrice: null,
    landedCostAud: 0, retailPrice: 0, exGstRevenue: 0, gstComponent: 0, profitPerUnit: 0, marginPct: 0, markupPct: 0,
    reconcileStatus: "UNKNOWN", shopifyVariantId: null, warningsDismissed: [], flags: [],
    ...partial,
  };
}
