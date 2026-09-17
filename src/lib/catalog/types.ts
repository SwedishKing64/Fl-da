// Canonical types shared by the extraction, mapping, pricing, review and export modules.

export type GstTreatment = "INCLUSIVE" | "EXCLUSIVE" | "NONE";
export type Currency = "AUD" | "USD" | "EUR" | "NZD" | "GBP" | "JPY" | "CAD";
export type PricingMode = "MARGIN" | "MARKUP";
export type RuleScope = "DEFAULT" | "CATEGORY" | "BRAND" | "PRODUCT";
export type ReconcileStatus = "UNKNOWN" | "NEW" | "VARIANT_ADD" | "UPDATE";
export type BatchStatus =
  | "UPLOADED"
  | "EXTRACTED"
  | "MAPPED"
  | "REVIEW"
  | "EXPORTED"
  | "PUSHED"
  | "ROLLED_BACK";

export const CURRENCIES: Currency[] = ["AUD", "USD", "EUR", "NZD", "GBP", "JPY", "CAD"];

export const CATEGORIES = [
  "skis",
  "snowboards",
  "boots",
  "bindings",
  "poles",
  "helmets",
  "goggles",
  "apparel",
  "accessories",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * The canonical line-item schema every supplier file is mapped onto. Keys are the values
 * stored in MappingTemplate.mappings. Keep this list in sync with CANONICAL_FIELDS below.
 */
export interface CanonicalLineItem {
  title: string;
  brand: string;
  modelCode: string;
  sku: string;
  barcode: string;
  costPrice: number | null;
  quantity: number | null;
  rrp: number | null; // supplier recommended retail (becomes Compare At Price when higher than retail)
  grams: number | null;
  length: string; // ski/snowboard length e.g. "172"
  size: string; // boot size / apparel size
  width: string; // boot last width (e.g. 98mm) or ski waist width
  colour: string;
  gender: string;
  season: string;
  category: string; // if the supplier states it; otherwise detected
  productType: string;
  description: string;
  flex: string;
  abilityLevel: string;
  dinRange: string;
  terrain: string;
  imageUrls: string[];
  collections: string; // comma separated
  tags: string; // comma separated
}

export interface CanonicalFieldDef {
  key: keyof CanonicalLineItem;
  label: string;
  kind: "text" | "number" | "list";
  required?: boolean;
  /** Lower-case header synonyms used to auto-suggest mappings. */
  synonyms: string[];
}

export const CANONICAL_FIELDS: CanonicalFieldDef[] = [
  { key: "title", label: "Product name", kind: "text", required: true, synonyms: ["title", "product", "product name", "description", "item", "item name", "name", "model", "product description", "article"] },
  { key: "brand", label: "Brand / vendor", kind: "text", synonyms: ["brand", "vendor", "manufacturer", "make", "supplier brand", "marke"] },
  { key: "modelCode", label: "Model / style code", kind: "text", synonyms: ["model", "model code", "style", "style code", "style no", "style number", "model no", "model number", "product code", "article no", "article number", "item no", "item number", "art nr", "ref"] },
  { key: "sku", label: "SKU", kind: "text", synonyms: ["sku", "sku code", "variant sku", "part number", "part no", "code", "ean/sku", "item code", "stock code"] },
  { key: "barcode", label: "Barcode / EAN / UPC", kind: "text", synonyms: ["barcode", "ean", "upc", "gtin", "ean code", "ean13", "upc code", "bar code"] },
  { key: "costPrice", label: "Unit cost price", kind: "number", synonyms: ["cost", "cost price", "unit cost", "unit price", "wholesale", "wholesale price", "price", "net price", "trade price", "dealer price", "whs", "w/s", "each", "unit", "amount", "line total", "total", "ext price", "extended price", "net amount", "value"] },
  { key: "quantity", label: "Quantity", kind: "number", synonyms: ["qty", "quantity", "units", "ordered", "qty ordered", "order qty", "pcs", "pieces", "count", "no of units"] },
  { key: "rrp", label: "RRP / MSRP", kind: "number", synonyms: ["rrp", "msrp", "retail", "retail price", "srp", "rec retail", "recommended retail", "list price", "map"] },
  { key: "grams", label: "Weight (grams)", kind: "number", synonyms: ["weight", "grams", "weight g", "weight (g)", "unit weight", "mass"] },
  { key: "length", label: "Length (cm)", kind: "text", synonyms: ["length", "len", "ski length", "board length", "size cm", "length cm", "cm"] },
  { key: "size", label: "Size", kind: "text", synonyms: ["size", "sizes", "sz", "sz.", "size range", "garment size", "apparel size", "clothing size", "size name", "size code", "size desc", "size description", "boot size", "mondo", "mondopoint", "mp", "shoe size", "size us", "us size", "eu size", "uk size"] },
  { key: "width", label: "Width", kind: "text", synonyms: ["width", "last", "last width", "waist", "waist width", "last mm"] },
  { key: "colour", label: "Colour", kind: "text", synonyms: ["colour", "color", "col", "colourway", "colorway", "farbe"] },
  { key: "gender", label: "Gender", kind: "text", synonyms: ["gender", "sex", "mens/womens", "m/w", "unisex"] },
  { key: "season", label: "Season", kind: "text", synonyms: ["season", "yr", "year", "model year", "collection"] },
  { key: "category", label: "Category", kind: "text", synonyms: ["category", "cat", "product category", "department", "group", "product group", "class"] },
  { key: "productType", label: "Product type", kind: "text", synonyms: ["type", "product type", "sub category", "subcategory", "sub-category"] },
  { key: "description", label: "Description / specs", kind: "text", synonyms: ["long description", "specs", "specification", "details", "features", "product details", "tech specs", "body"] },
  { key: "flex", label: "Flex", kind: "text", synonyms: ["flex", "flex index", "flex rating", "stiffness"] },
  { key: "abilityLevel", label: "Ability level", kind: "text", synonyms: ["ability", "ability level", "skill", "skill level", "level", "rider level"] },
  { key: "dinRange", label: "DIN range", kind: "text", synonyms: ["din", "din range", "release", "release value"] },
  { key: "terrain", label: "Terrain", kind: "text", synonyms: ["terrain", "use", "discipline", "style of skiing", "category of use"] },
  { key: "imageUrls", label: "Image URL(s)", kind: "list", synonyms: ["image", "images", "image url", "image urls", "photo", "picture", "img", "image src", "image link", "url"] },
  { key: "collections", label: "Collections", kind: "text", synonyms: ["collections", "collection"] },
  { key: "tags", label: "Tags", kind: "text", synonyms: ["tags", "keywords"] },
];

export const CANONICAL_KEYS = CANONICAL_FIELDS.map((f) => f.key);

export function emptyLineItem(): CanonicalLineItem {
  return {
    title: "",
    brand: "",
    modelCode: "",
    sku: "",
    barcode: "",
    costPrice: null,
    quantity: null,
    rrp: null,
    grams: null,
    length: "",
    size: "",
    width: "",
    colour: "",
    gender: "",
    season: "",
    category: "",
    productType: "",
    description: "",
    flex: "",
    abilityLevel: "",
    dinRange: "",
    terrain: "",
    imageUrls: [],
    collections: "",
    tags: "",
  };
}

/** Ski-specific product metafields written as `<name> (product.metafields.<ns>.<key>)`. */
export interface MetafieldDef {
  key: string;
  namespace: string;
  name: string;
  type: "single_line_text_field" | "number_integer" | "list.single_line_text_field";
  source: keyof CanonicalLineItem;
}

export const SKI_METAFIELDS: MetafieldDef[] = [
  { key: "length_cm", namespace: "ski", name: "Length (cm)", type: "single_line_text_field", source: "length" },
  { key: "flex", namespace: "ski", name: "Flex", type: "single_line_text_field", source: "flex" },
  { key: "ability_level", namespace: "ski", name: "Ability Level", type: "single_line_text_field", source: "abilityLevel" },
  { key: "din_range", namespace: "ski", name: "DIN Range", type: "single_line_text_field", source: "dinRange" },
  { key: "terrain", namespace: "ski", name: "Terrain", type: "single_line_text_field", source: "terrain" },
  { key: "waist_width", namespace: "ski", name: "Waist / Last Width", type: "single_line_text_field", source: "width" },
  { key: "gender", namespace: "ski", name: "Gender", type: "single_line_text_field", source: "gender" },
  { key: "season", namespace: "ski", name: "Season", type: "single_line_text_field", source: "season" },
  { key: "model_code", namespace: "ski", name: "Model Code", type: "single_line_text_field", source: "modelCode" },
];

export function metafieldColumn(def: MetafieldDef): string {
  return `${def.name} (product.metafields.${def.namespace}.${def.key})`;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface FxRates {
  [currency: string]: number; // units of AUD per 1 unit of currency, e.g. USD: 1.52
}

export interface ShopifyLocation {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface AppSettings {
  gstRate: number; // 0.10
  pricesIncludeGst: boolean; // retail prices written to CSV are GST-inclusive (AU default)
  minMarginPct: number; // warn when margin below this (e.g. 20)
  defaultRoundTo: string; // "0.99"
  fxRates: FxRates;
  shopify: {
    storeDomain: string; // my-store.myshopify.com
    accessToken: string; // Admin API access token (custom app)
    apiVersion: string; // e.g. 2025-07
  };
  locations: ShopifyLocation[];
  publicBaseUrl: string; // where uploaded images are served for the CSV, e.g. https://tools.example.com
  seoTone: string; // tone instructions for AI-written descriptions
  houseRules: string; // free text: how this shop builds products, fed to the AI on every product
}

export const DEFAULT_SETTINGS: AppSettings = {
  gstRate: 0.1,
  pricesIncludeGst: true,
  minMarginPct: 20,
  defaultRoundTo: "0.99",
  fxRates: { AUD: 1, USD: 1.52, EUR: 1.65, NZD: 0.92, GBP: 1.93, JPY: 0.0102, CAD: 1.1 },
  shopify: { storeDomain: "", accessToken: "", apiVersion: "2025-07" },
  locations: [],
  publicBaseUrl: "",
  seoTone:
    "Friendly, knowledgeable Sydney ski shop. Plain English, no hype, mention who the product suits and key specs.",
  houseRules: "",
};

// ---------------------------------------------------------------------------
// Validation flags surfaced in the review grid
// ---------------------------------------------------------------------------

export type FlagSeverity = "error" | "warning";

export interface RowFlag {
  code:
    | "MISSING_TITLE"
    | "MISSING_PRICE"
    | "MISSING_COST"
    | "MISSING_SKU"
    | "DUPLICATE_SKU_BATCH"
    | "DUPLICATE_SKU_SHOPIFY"
    | "DUPLICATE_HANDLE"
    | "INVALID_HANDLE"
    | "DUPLICATE_OPTIONS"
    | "MISSING_OPTION_VALUE"
    | "NO_IMAGE"
    | "FEW_IMAGES"
    | "INVALID_IMAGE_URL"
    | "LOW_MARGIN"
    | "NEGATIVE_PROFIT"
    | "MISSING_VENDOR"
    | "MISSING_TYPE"
    | "UPDATE_EXISTING";
  severity: FlagSeverity;
  message: string;
}

export const WARNING_CODES: RowFlag["code"][] = [
  "NO_IMAGE",
  "FEW_IMAGES",
  "INVALID_IMAGE_URL",
  "LOW_MARGIN",
  "NEGATIVE_PROFIT",
  "MISSING_VENDOR",
  "MISSING_TYPE",
  "MISSING_SKU",
  "UPDATE_EXISTING",
  "DUPLICATE_SKU_SHOPIFY",
];
