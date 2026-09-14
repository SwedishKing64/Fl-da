/**
 * Product templates: teaching the importer by example.
 *
 * Hand-writing a tag rule for every convention is slow and easy to get wrong. Instead you can
 * upload a Shopify export of products you have already built for a brand or a product type, and
 * this reads the conventions back out of it: the tags that always appear, the collections, the
 * product type, what the options are called, and which metafields carry a standing value.
 *
 * Everything here is pure so it can be tested without a database.
 */

import { parseCsv } from "./csv";

export interface TemplateAnalysis {
  productCount: number;
  vendor: string;
  productType: string;
  /** Tags present on most products, so worth applying to every new one. */
  commonTags: string[];
  /** Every tag seen, with how many products carried it. Shown so you can see what was ignored. */
  tagCounts: Array<{ tag: string; count: number }>;
  collections: string[];
  optionNames: string[];
  /** Metafield key → the value most products share. Only keys with a clear winner. */
  metafields: Record<string, string>;
  /** Every metafield key seen, including ones that vary per product. */
  metafieldKeys: string[];
  titleExamples: string[];
  seoTitleExample: string;
  seoDescriptionExample: string;
  bodyExample: string;
  /** Columns we could not make sense of, so the upload is never silently partial. */
  warnings: string[];
}

/** A product this template might apply to. */
export interface TemplateTarget {
  vendor: string;
  productType: string;
  category: string;
}

export interface ProductTemplateLike {
  id: string;
  name: string;
  scope: "BRAND" | "PRODUCT_TYPE" | "CATEGORY";
  matchValue: string;
  /** Narrows any scope to one product type. Empty means "every product that scope matches". */
  matchProductType?: string;
  productType: string;
  tags: string[];
  collections: string[];
  optionNames: string[];
  metafields: Record<string, string>;
  priority: number;
  active: boolean;
}

export const TEMPLATE_SCOPES: Array<{ key: ProductTemplateLike["scope"]; label: string }> = [
  { key: "BRAND", label: "Brand" },
  { key: "PRODUCT_TYPE", label: "Product type" },
  { key: "CATEGORY", label: "Category" },
];

/** Least specific first, so a more specific template wins where they disagree. */
const SCOPE_ORDER: Record<ProductTemplateLike["scope"], number> = { CATEGORY: 0, BRAND: 1, PRODUCT_TYPE: 2 };

const METAFIELD_COLUMN = /\(product\.metafields\.[^.)]+\.([^)]+)\)\s*$/i;
/** A tag or collection has to appear on this share of products before it counts as a convention. */
const DOMINANT = 0.6;
/**
 * A metafield value has to be near-unanimous. An extra tag on a product is harmless, but a
 * standing value like `gender` is a claim about the product: carrying "Unisex" over from two
 * thirds of a catalogue would quietly mislabel the rest.
 */
const DOMINANT_VALUE = 0.9;

const norm = (value: string) => value.trim().toLowerCase();
const splitList = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

function dominantValue(counts: Map<string, number>, total: number, threshold = DOMINANT): string {
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return total > 0 && bestCount / total >= threshold ? best : "";
}

function bump(counts: Map<string, number>, key: string) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Read a Shopify product export and describe the conventions in it. Rows are grouped by Handle
 * because Shopify puts product-level fields only on a handle's first row.
 */
export function analyseShopifyCsv(text: string): TemplateAnalysis {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  if (rows.length < 2) {
    return emptyAnalysis(["The file has no data rows."]);
  }
  const headers = rows[0].map((h) => h.trim());
  const index = (name: string) => headers.findIndex((h) => norm(h) === norm(name));

  const iHandle = index("Handle");
  if (iHandle < 0) {
    return emptyAnalysis(["No Handle column, so this does not look like a Shopify product export."]);
  }
  const iTitle = index("Title");
  const iVendor = index("Vendor");
  const iType = index("Type");
  const iTags = index("Tags");
  const iCollection = index("Collection");
  const iSeoTitle = index("SEO Title");
  const iSeoDesc = index("SEO Description");
  const iBody = index("Body (HTML)");
  const optionNameCols = [index("Option1 Name"), index("Option2 Name"), index("Option3 Name")];
  const metafieldCols = headers
    .map((header, i) => ({ i, key: header.match(METAFIELD_COLUMN)?.[1]?.trim() ?? "" }))
    .filter((c) => c.key);

  if (iTags < 0) warnings.push("No Tags column, so no tag conventions were learned.");
  if (iType < 0) warnings.push("No Type column, so no product type was learned.");

  const vendors = new Map<string, number>();
  const types = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const collectionCounts = new Map<string, number>();
  const optionCombos = new Map<string, number>();
  const metafieldValues = new Map<string, Map<string, number>>();
  const metafieldKeys = new Set<string>();
  const titleExamples: string[] = [];
  let seoTitleExample = "";
  let seoDescriptionExample = "";
  let bodyExample = "";

  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const handle = (row[iHandle] ?? "").trim();
    // Only a handle's first row carries the product-level fields; later rows are extra
    // variants and images.
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);

    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

    bump(vendors, cell(iVendor));
    bump(types, cell(iType));

    for (const tag of new Set(splitList(cell(iTags)))) bump(tagCounts, tag);
    for (const collection of new Set(splitList(cell(iCollection)))) bump(collectionCounts, collection);

    const names = optionNameCols.map(cell).filter((n) => n && norm(n) !== "title");
    if (names.length) bump(optionCombos, names.join(", "));

    for (const { i, key } of metafieldCols) {
      const value = cell(i);
      if (!value) continue;
      metafieldKeys.add(key);
      if (!metafieldValues.has(key)) metafieldValues.set(key, new Map());
      bump(metafieldValues.get(key)!, value);
    }

    const title = cell(iTitle);
    if (title && titleExamples.length < 3) titleExamples.push(title);
    if (!seoTitleExample) seoTitleExample = cell(iSeoTitle);
    if (!seoDescriptionExample) seoDescriptionExample = cell(iSeoDesc);
    if (!bodyExample) bodyExample = cell(iBody);
  }

  const productCount = seen.size;
  if (productCount === 0) return emptyAnalysis(["No products found — every row was missing a Handle."]);

  const metafields: Record<string, string> = {};
  for (const [key, values] of metafieldValues) {
    const winner = dominantValue(values, productCount, DOMINANT_VALUE);
    if (winner) metafields[key] = winner;
  }

  const commonTags = [...tagCounts.entries()]
    .filter(([, count]) => count / productCount >= DOMINANT)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);

  return {
    productCount,
    vendor: dominantValue(vendors, productCount),
    productType: dominantValue(types, productCount),
    commonTags,
    tagCounts: [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count })),
    collections: [...collectionCounts.entries()]
      .filter(([, count]) => count / productCount >= DOMINANT)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([c]) => c),
    optionNames: splitList(dominantValue(optionCombos, productCount, 0.4)),
    metafields,
    metafieldKeys: [...metafieldKeys].sort(),
    titleExamples,
    seoTitleExample,
    seoDescriptionExample,
    bodyExample: bodyExample.slice(0, 400),
    warnings,
  };
}

function emptyAnalysis(warnings: string[]): TemplateAnalysis {
  return {
    productCount: 0,
    vendor: "",
    productType: "",
    commonTags: [],
    tagCounts: [],
    collections: [],
    optionNames: [],
    metafields: {},
    metafieldKeys: [],
    titleExamples: [],
    seoTitleExample: "",
    seoDescriptionExample: "",
    bodyExample: "",
    warnings,
  };
}

/** Every active template that applies to this product, least specific first. */
export function matchingTemplates(target: TemplateTarget, templates: ProductTemplateLike[]): ProductTemplateLike[] {
  return templates
    .filter((t) => {
      if (!t.active || !t.matchValue.trim()) return false;
      const narrow = (t.matchProductType ?? "").trim();
      if (narrow && norm(target.productType) !== norm(narrow)) return false;
      const want = norm(t.matchValue);
      if (t.scope === "BRAND") return norm(target.vendor) === want;
      if (t.scope === "PRODUCT_TYPE") return norm(target.productType) === want;
      return norm(target.category) === want;
    })
    .sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || a.priority - b.priority);
}

export interface TemplateOutcome {
  tags: string[];
  collections: string[];
  productType: string;
  metafields: Record<string, string>;
  optionNames: string[];
  applied: ProductTemplateLike[];
}

/**
 * Apply the templates a product matches. Conventions are additive and never destructive: tags
 * and collections are unioned, and a product type, metafield or option name already on the
 * product is left alone, so anything a person set by hand survives.
 */
export function applyTemplates(
  product: { vendor: string; productType: string; category: string; tags: string[]; collections: string[]; metafields: Record<string, string>; optionNames?: string[] },
  templates: ProductTemplateLike[],
): TemplateOutcome {
  const applied = matchingTemplates({ vendor: product.vendor, productType: product.productType, category: product.category }, templates);

  const tags = [...product.tags];
  const collections = [...product.collections];
  const metafields = { ...product.metafields };
  let productType = product.productType;
  let optionNames = [...(product.optionNames ?? [])].filter(Boolean);

  const has = (list: string[], value: string) => list.some((v) => norm(v) === norm(value));

  for (const template of applied) {
    for (const tag of template.tags) if (!has(tags, tag)) tags.push(tag);
    for (const collection of template.collections) if (!has(collections, collection)) collections.push(collection);
    if (!productType && template.productType) productType = template.productType;
    for (const [key, value] of Object.entries(template.metafields)) {
      if (!metafields[key]) metafields[key] = value;
    }
    if (optionNames.length === 0 && template.optionNames.length) optionNames = [...template.optionNames];
  }

  return { tags, collections, productType, metafields, optionNames, applied };
}

/** A short, human sentence describing what a template will do. */
export function describeTemplate(template: ProductTemplateLike): string {
  const parts: string[] = [];
  if (template.productType) parts.push(`type ${template.productType}`);
  if (template.tags.length) parts.push(`${template.tags.length} tag${template.tags.length === 1 ? "" : "s"}`);
  if (template.collections.length) parts.push(`${template.collections.length} collection${template.collections.length === 1 ? "" : "s"}`);
  const metafieldCount = Object.keys(template.metafields).length;
  if (metafieldCount) parts.push(`${metafieldCount} metafield${metafieldCount === 1 ? "" : "s"}`);
  if (template.optionNames.length) parts.push(`options ${template.optionNames.join(" / ")}`);
  return parts.length ? parts.join(", ") : "nothing yet";
}
