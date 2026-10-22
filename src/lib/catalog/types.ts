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
  /**
   * How many of the quantity the supplier has since cancelled, when the sheet says.
   *
   * Burton's "RDD or Cancel" sheet lists the whole season's order with a Cancel column against the
   * lines that will not be shipped; what arrives is the quantity less that. Read on its own the
   * quantity booked stock for 162 units that were never coming.
   */
  cancelled?: number | null;
  /**
   * The handle of the shop's listing this line was placed on by its barcode — the shop already has
   * this very item, under that handle, so the product is written there as a quantity update rather
   * than listed again for the new season. Set by the build, never read off a sheet.
   */
  shopHandle?: string;
  /**
   * When this line is due, as the supplier wrote it ("2026-04-01", "Apr 26"), when the sheet says.
   * An order can span two deliveries — Burton's RDD sheet has lines for November and for April —
   * and "only the April delivery" needs the date on each line to go by.
   */
  deliveryDate?: string;
  grams: number | null;
  length: string; // ski/snowboard length e.g. "172"
  size: string; // boot size / apparel size
  width: string; // boot last width (e.g. 98mm) or ski waist width
  colour: string;
  /**
   * Any other option that tells a variant apart and is not its length, size, width or colour: a
   * tent's capacity (2P), a pack's volume (65L), a sleeping bag's length or zip side, a bottle's
   * capacity. Outdoor and general goods vary on these, and a ski-shaped line had nowhere for them.
   */
  variant?: string;
  /** What that option is called on the listing: Capacity, Volume, Zip. Empty for "Option". */
  variantName?: string;
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
  /**
   * Columns the mapping had no canonical home for, kept rather than dropped.
   *
   * A supplier's spec export is mostly these. Volkl's carries tip width, tail width, three sidecut
   * radii, the core, the key technologies and the weight with and without a binding — thirty-odd
   * columns of exactly what a customer wants to know, and until now every one of them was thrown
   * away at the mapping step because it did not fit one of the fields above. They become the
   * product's metafields, which is where the Tech Specs list on the page is built from.
   */
  extras?: Record<string, string>;
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
  { key: "title", label: "Product name", kind: "text", required: true, synonyms: ["title", "product", "product name", "description", "item", "item name", "name", "model", "model name", "product description", "article"] },
  { key: "brand", label: "Brand / vendor", kind: "text", synonyms: ["brand", "vendor", "manufacturer", "make", "supplier brand", "marke"] },
  { key: "modelCode", label: "Model / style code", kind: "text", synonyms: ["model", "model code", "style", "style code", "style no", "style number", "model no", "model number", "material", "material number", "material no", "product code", "article no", "article number", "basic article no", "supplier code", "item no", "item number", "art nr", "ref"] },
  // "sku no length" is Volkl's own heading, "SKU no. // LENGTH", and it has to outrank the bare
  // "length" synonym that also matches it — the longest match wins, so it is spelled out in full.
  { key: "sku", label: "SKU", kind: "text", synonyms: ["sku", "sku code", "sku no", "sku number", "sku no length", "variant sku", "variant code", "part number", "part no", "code", "ean/sku", "item code", "stock code"] },
  { key: "barcode", label: "Barcode / EAN / UPC", kind: "text", synonyms: ["barcode", "ean", "upc", "gtin", "ean no", "ean number", "ean code", "ean13", "upc code", "bar code"] },
  { key: "costPrice", label: "Unit cost price", kind: "number", synonyms: ["cost", "cost price", "unit cost", "unit price", "wholesale", "wholesale price", "whsl", "whsl price", "price", "net price", "trade price", "dealer price", "whs", "w/s", "each", "unit", "amount", "line total", "total", "ext price", "extended price", "net amount", "value"] },
  { key: "quantity", label: "Quantity", kind: "number", synonyms: ["qty", "quantity", "units", "ordered", "qty ordered", "order qty", "pcs", "pieces", "count", "no of units"] },
  { key: "rrp", label: "RRP / MSRP", kind: "number", synonyms: ["rrp", "msrp", "retail", "retail price", "srp", "rec retail", "recommended retail", "list price", "map"] },
  { key: "cancelled", label: "Quantity cancelled", kind: "number", synonyms: ["cancel", "cancelled", "canceled", "cancelled qty", "cancel qty", "qty cancelled", "cancelled quantity", "cancellations", "cancelled units"] },
  { key: "deliveryDate", label: "Delivery date", kind: "text", synonyms: ["delivery date", "requested delivery date", "rdd", "delivery", "delivery month", "del date", "ship date", "shipping date", "eta", "etd", "due date", "despatch date", "dispatch date", "delivery window", "estimated delivery", "estimated delivery date", "est delivery", "est delivery date", "expected delivery", "expected delivery date", "delivery eta", "arrival", "arrival date", "expected arrival"] },
  { key: "grams", label: "Weight (grams)", kind: "number", synonyms: ["weight", "grams", "weight g", "weight (g)", "unit weight", "mass"] },
  { key: "length", label: "Length (cm)", kind: "text", synonyms: ["length", "len", "ski length", "size ski length", "board length", "size cm", "length cm", "cm"] },
  { key: "size", label: "Size", kind: "text", synonyms: ["size", "sizes", "sz", "sz.", "size range", "garment size", "apparel size", "clothing size", "size name", "size code", "size desc", "size description", "boot size", "mondo", "mondopoint", "mp", "shoe size", "size us", "us size", "eu size", "uk size"] },
  { key: "variant", label: "Other option (capacity, volume, zip…)", kind: "text", synonyms: ["volume", "capacity", "litres", "liters", "volume l", "capacity l", "persons", "person", "sleeps", "berth", "zip", "zip side", "zip position", "torso", "torso size", "bag length", "option", "variant"] },
  { key: "width", label: "Width / fit", kind: "text", synonyms: ["width", "last", "last width", "waist", "waist width", "last mm", "fit", "fit type", "fitting"] },
  { key: "colour", label: "Colour", kind: "text", synonyms: ["colour", "color", "col", "colour name", "color name", "colour description", "color description", "basic colour", "basic color", "colourway", "colorway", "farbe"] },
  { key: "gender", label: "Gender", kind: "text", synonyms: ["gender", "sex", "suitable for", "mens/womens", "m/w", "unisex"] },
  { key: "season", label: "Season", kind: "text", synonyms: ["season", "yr", "year", "model year", "collection", "season indicator", "sap season indicator", "season code"] },
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

/** A product metafield, written as `<name> (product.metafields.<ns>.<key>)`. Which ones a shop writes comes from its pack. */
export interface MetafieldDef {
  key: string;
  namespace: string;
  name: string;
  type: "single_line_text_field" | "number_integer" | "list.single_line_text_field";
  source: keyof CanonicalLineItem;
}

/** The snow pack's metafields, under the namespace the ski shop's store already uses. */
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

/**
 * Every other shop's: the few that mean the same in any trade, under Shopify's own namespace for
 * a shop's definitions. A tent written to `ski.length_cm` was the first thing a second trade saw.
 */
export const GENERAL_METAFIELDS: MetafieldDef[] = [
  { key: "gender", namespace: "custom", name: "Gender", type: "single_line_text_field", source: "gender" },
  { key: "season", namespace: "custom", name: "Season", type: "single_line_text_field", source: "season" },
  { key: "model_code", namespace: "custom", name: "Model Code", type: "single_line_text_field", source: "modelCode" },
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
    accessToken: string; // Admin API access token: from the install link, or pasted from a custom app
    apiVersion: string; // e.g. 2025-07
    /** How the store was connected: through Flöda's install link (its token expires and is refreshed), or a pasted token. */
    connectedBy?: "oauth" | "token";
    /** For a connection made through the install link: the refresh token, and when each token lapses (ms since epoch). */
    refreshToken?: string;
    expiresAt?: number;
    refreshExpiresAt?: number;
    scope?: string;
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
    "Friendly, knowledgeable specialist shop. Plain English, no hype, mention who the product suits and key specs.",
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
    | "MISSING_BARCODE"
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
    | "UNKNOWN_TYPE"
    | "UPDATE_EXISTING"
    | "INVALID_BARCODE"
    | "ODD_BARCODE"
    | "SWAPPED_CODES"
    | "AMBIGUOUS_MATCH";
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
  "MISSING_BARCODE",
  "UPDATE_EXISTING",
  "DUPLICATE_SKU_SHOPIFY",
  "ODD_BARCODE",
];

/**
 * The errors nothing can repair on the way out. The other errors have one right answer the
 * export applies itself (see repair.ts); these are a number or a code that is wrong in a way
 * only a person can settle, and a file with one in it would put that wrong number on the shop.
 */
export const HARD_CODES: RowFlag["code"][] = ["INVALID_BARCODE", "SWAPPED_CODES", "NEGATIVE_PROFIT", "AMBIGUOUS_MATCH", "UNKNOWN_TYPE"];

/**
 * A column holding one of the supplier's own feature bullets: "Bullet 3", "Feature 1", "Tech Spec 2".
 *
 * Not "Highlight": Burton's "Product Highlight" columns restate the bullets as marketing lines, and
 * the shop's own listings use the bullets — its Custom X body is Bullet 1 to 7, word for word.
 */
export const FEATURE_COLUMN = /^(bullet|feature|key feature|tech ?spec|spec|technology)s?\s*#?\s*\d+$/i;

/**
 * The words a supplier uses for a colourway. Read from the END of a name only — "BLAZE 94 ROSE" is
 * the Blaze 94 in rose, while "BLACK CROWS" is a brand and "BLACK PEARL" a ski.
 */
export const COLOUR_WORDS = new Set([
  "BLACK", "WHITE", "GREY", "GRAY", "GRAPHITE", "CHARCOAL", "ANTHRACITE", "SILVER", "GOLD", "BRONZE",
  "BLUE", "NAVY", "TEAL", "TURQUOISE", "MINT", "GREEN", "LIME", "OLIVE", "KHAKI", "YELLOW", "ORANGE",
  "CORAL", "RED", "PINK", "ROSE", "PURPLE", "VIOLET", "BROWN", "BEIGE", "SAND", "CREAM",
]);
