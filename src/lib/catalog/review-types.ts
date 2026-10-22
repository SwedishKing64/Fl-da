// Plain data shapes shared between the server (Prisma -> view) and the review grid (client).

import type { RowFlag } from "./types";
import type { MatchCandidate } from "./match-candidates";

export interface ReviewImage {
  id: string;
  url: string;
  position: number;
  variantId: string | null;
  source: string;
  validated: boolean;
}

export interface ReviewVariant {
  id: string;
  productId: string;
  sku: string;
  barcode: string;
  option1Value: string | null;
  option2Value: string | null;
  option3Value: string | null;
  grams: number;
  quantity: number;
  costPrice: number;
  costCurrency: string;
  gstTreatment: string;
  fxRateToHome: number;
  freightPerUnitHome: number;
  pricingRuleId: string | null;
  pricingRuleName: string | null;
  retailOverride: number | null;
  compareAtPrice: number | null;
  landedCostHome: number;
  retailPrice: number;
  exGstRevenue: number;
  gstComponent: number;
  profitPerUnit: number;
  marginPct: number;
  markupPct: number;
  reconcileStatus: string;
  shopifyVariantId: string | null;
  warningsDismissed: string[];
  flags: RowFlag[];
}

export interface ReviewProduct {
  id: string;
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  category: string;
  tags: string;
  collections: string;
  status: string;
  published: boolean;
  seoTitle: string;
  seoDescription: string;
  /** What the web lookup did about the columns the invoice left empty. */
  lookupStatus: string;
  lookupSource: string;
  option1Name: string | null;
  option2Name: string | null;
  option3Name: string | null;
  metafields: Record<string, string>;
  reconcileStatus: string;
  shopifyProductId: string | null;
  /** The products in the shop this one could be, when the check found more than one. */
  matchCandidates: MatchCandidate[];
  matchDecided: boolean;
  images: ReviewImage[];
  variants: ReviewVariant[];
  flags: RowFlag[];
}

export interface ReviewSummary {
  units: number;
  variants: number;
  products: number;
  totalRetailIncGst: number;
  totalGst: number;
  totalExGstRevenue: number;
  totalLandedCost: number;
  totalNetProfit: number;
  averageMarginPct: number;
  lowMarginVariants: number;
  errors: number;
  warnings: number;
}

/** Fields editable inline on a product row. */
export const PRODUCT_EDITABLE = ["handle", "title", "vendor", "productType", "category", "tags", "collections", "status", "seoTitle", "seoDescription", "bodyHtml"] as const;
/** Fields editable inline on a variant row. */
export const VARIANT_EDITABLE = ["sku", "barcode", "option1Value", "option2Value", "option3Value", "grams", "quantity", "costPrice", "gstTreatment", "retailOverride", "compareAtPrice", "freightPerUnitHome"] as const;
