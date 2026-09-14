// DB-free pipeline used for regression fixtures and tests: raw table -> mapped items ->
// grouped products -> priced variants -> validated review view -> Shopify CSV.

import { applyMapping, type Mapping, type MappingOptions } from "./mapping";
import { groupLineItems } from "./grouping";
import type { CategoryRuleLike } from "./categorize";
import { allocateFreight, exGstCostAud, priceVariant, selectRule, type PricingRuleLike } from "./pricing";
import { generateCsv, type CsvProduct } from "./csv";
import { toCsvProducts } from "./pipeline-pure";
import { SKI_METAFIELDS, metafieldColumn, type AppSettings, type GstTreatment } from "./types";
import type { ReviewProduct, ReviewSummary, ReviewVariant } from "./review-types";
import { blockingErrors, summarise, validateReview, warningList } from "./validate";
import type { ExtractedTable } from "./extract/types";

export interface OfflineBatch {
  currency: string;
  fxRateToAud: number;
  gstTreatment: GstTreatment;
  freightTotalAud: number;
  freightMode: "PER_UNIT" | "BY_VALUE";
}

export interface OfflineResult {
  products: ReviewProduct[];
  csvProducts: CsvProduct[];
  csv: string;
  summary: ReviewSummary;
  errors: string[];
  warnings: string[];
}

export function runOffline(
  table: ExtractedTable,
  mapping: Mapping,
  mappingOptions: MappingOptions,
  batch: OfflineBatch,
  pricingRules: PricingRuleLike[],
  categoryRules: CategoryRuleLike[],
  settings: Pick<AppSettings, "gstRate" | "pricesIncludeGst" | "minMarginPct">,
): OfflineResult {
  const items = table.rows.map((row) => applyMapping(row, mapping, mappingOptions)).filter((i) => i.title || i.sku || i.costPrice !== null);
  const grouped = groupLineItems(items, categoryRules);

  const products: ReviewProduct[] = grouped.map((g, pi) => ({
    id: `p${pi + 1}`,
    handle: g.handle,
    title: g.title,
    bodyHtml: g.description ? `<p>${g.description}</p>` : "",
    vendor: g.brand,
    productType: g.productType,
    category: g.category,
    tags: g.tags.join(", "),
    collections: g.collections.join(", "),
    status: "draft",
    published: false,
    seoTitle: "",
    seoDescription: "",
    option1Name: g.option1Name,
    option2Name: g.option2Name,
    option3Name: g.option3Name,
    metafields: g.metafields,
    reconcileStatus: "UNKNOWN",
    shopifyProductId: null,
    images: g.imageUrls.map((url, i) => ({ id: `p${pi + 1}i${i + 1}`, url, position: i + 1, variantId: null, source: "SUPPLIER", validated: false })),
    variants: g.variants.map<ReviewVariant>((v, vi) => ({
      id: `p${pi + 1}v${vi + 1}`,
      productId: `p${pi + 1}`,
      sku: v.item.sku,
      barcode: v.item.barcode,
      option1Value: v.option1Value,
      option2Value: v.option2Value,
      option3Value: v.option3Value,
      grams: v.item.grams ?? 0,
      quantity: v.item.quantity ?? 0,
      costPrice: v.item.costPrice ?? 0,
      costCurrency: batch.currency,
      gstTreatment: batch.gstTreatment,
      fxRateToAud: batch.fxRateToAud,
      freightPerUnitAud: 0,
      pricingRuleId: null,
      pricingRuleName: null,
      retailOverride: null,
      compareAtPrice: v.item.rrp,
      landedCostAud: 0, retailPrice: 0, exGstRevenue: 0, gstComponent: 0, profitPerUnit: 0, marginPct: 0, markupPct: 0,
      reconcileStatus: "UNKNOWN",
      shopifyVariantId: null,
      warningsDismissed: [],
      flags: [],
    })),
    flags: [],
  }));

  const allVariants = products.flatMap((p) => p.variants.map((v) => ({ p, v })));
  const freight = allocateFreight(batch.freightTotalAud, batch.freightMode, allVariants.map(({ v }) => ({ id: v.id, quantity: v.quantity, exGstCostAud: exGstCostAud(v.costPrice, v.gstTreatment as GstTreatment, v.fxRateToAud, settings.gstRate) })));
  for (const { p, v } of allVariants) {
    v.freightPerUnitAud = freight[v.id] ?? 0;
    const rule = selectRule(pricingRules, { category: p.category, brand: p.vendor, sku: v.sku, modelCode: "" });
    const r = priceVariant({ costPrice: v.costPrice, gstTreatment: v.gstTreatment as GstTreatment, fxRateToAud: v.fxRateToAud, freightPerUnitAud: v.freightPerUnitAud, quantity: v.quantity, rule, retailOverride: null }, settings);
    Object.assign(v, { landedCostAud: r.landedCostAud, retailPrice: r.retailPrice, exGstRevenue: r.exGstRevenue, gstComponent: r.gstComponent, profitPerUnit: r.profitPerUnit, marginPct: r.marginPct, markupPct: r.markupPct, pricingRuleName: r.ruleName });
  }

  validateReview(products, { minMarginPct: settings.minMarginPct });
  const csvProducts = toCsvProducts(products);
  return {
    products,
    csvProducts,
    csv: generateCsv(csvProducts, { metafieldColumns: SKI_METAFIELDS.map(metafieldColumn) }),
    summary: summarise(products),
    errors: blockingErrors(products),
    warnings: warningList(products),
  };
}
