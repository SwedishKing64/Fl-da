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
import { isNotOurs, slugTag } from "./tagging";

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
  /**
   * What a person wrote down about this brand or type that the export could not show: which fields
   * matter, what the supplier calls things, how a title should read. Fed to the AI when it writes
   * copy for a matching product.
   */
  notes?: string;
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
/** Fewer products than this in a brand/type group and there is nothing reliable to learn from them. */
export const MIN_GROUP = 3;

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

/** One product as read out of an export: a handle's first row, which carries the product-level fields. */
interface ProductRecord {
  vendor: string;
  productType: string;
  tags: string[];
  collections: string[];
  optionNames: string[];
  metafields: Record<string, string>;
  title: string;
  seoTitle: string;
  seoDescription: string;
  body: string;
}

/**
 * Pull the product-level rows out of a Shopify export. Rows are grouped by Handle because Shopify
 * puts product-level fields only on a handle's first row; later rows are extra variants and images.
 */
function readProducts(text: string): { products: ProductRecord[]; warnings: string[]; fatal?: string } {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  if (rows.length < 2) return { products: [], warnings, fatal: "The file has no data rows." };

  const headers = rows[0].map((h) => h.trim());
  const index = (name: string) => headers.findIndex((h) => norm(h) === norm(name));

  const iHandle = index("Handle");
  if (iHandle < 0) {
    return { products: [], warnings, fatal: "No Handle column, so this does not look like a Shopify product export." };
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

  const products: ProductRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const handle = (row[iHandle] ?? "").trim();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);

    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    const metafields: Record<string, string> = {};
    for (const { i, key } of metafieldCols) {
      const value = cell(i);
      if (value) metafields[key] = value;
    }
    products.push({
      vendor: cell(iVendor),
      productType: cell(iType),
      // Two kinds of tag are never conventions. Shopify derives size, colour and price bands
      // itself, and staff apply sale and stocktake tags by hand. Learning either would be wrong:
      // one brand's colours stamped on everything, or every new product born on clearance.
      //
      // What survives is written in the house spelling rather than whatever the export happened
      // to contain. Older products spell these with spaces — "ski tuning", "freestyle and
      // all-mountain boards" — and a learned template repeating that would put a second, almost
      // identical tag on every new product beside the hyphenated one the importer writes.
      tags: [...new Set(splitList(cell(iTags)).map(slugTag))].filter((tag) => tag && !isNotOurs(tag)),
      collections: [...new Set(splitList(cell(iCollection)))],
      optionNames: optionNameCols.map(cell).filter((n) => n && norm(n) !== "title"),
      metafields,
      title: cell(iTitle),
      seoTitle: cell(iSeoTitle),
      seoDescription: cell(iSeoDesc),
      body: cell(iBody),
    });
  }
  return { products, warnings };
}

/** Describe the conventions shared by a set of products. */
function analyseProducts(products: ProductRecord[], warnings: string[]): TemplateAnalysis {
  const productCount = products.length;
  if (productCount === 0) return emptyAnalysis(["No products found — every row was missing a Handle."]);

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

  for (const p of products) {
    bump(vendors, p.vendor);
    bump(types, p.productType);
    for (const tag of p.tags) bump(tagCounts, tag);
    for (const collection of p.collections) bump(collectionCounts, collection);
    if (p.optionNames.length) bump(optionCombos, p.optionNames.join(", "));
    for (const [key, value] of Object.entries(p.metafields)) {
      metafieldKeys.add(key);
      if (!metafieldValues.has(key)) metafieldValues.set(key, new Map());
      bump(metafieldValues.get(key)!, value);
    }
    if (p.title && titleExamples.length < 3) titleExamples.push(p.title);
    if (!seoTitleExample) seoTitleExample = p.seoTitle;
    if (!seoDescriptionExample) seoDescriptionExample = p.seoDescription;
    if (!bodyExample) bodyExample = p.body;
  }

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

/** Read a Shopify product export and describe the conventions in it. */
export function analyseShopifyCsv(text: string): TemplateAnalysis {
  const { products, warnings, fatal } = readProducts(text);
  if (fatal) return emptyAnalysis([fatal]);
  return analyseProducts(products, warnings);
}

/** One brand/type worth of products found inside an export, ready to become a template. */
export interface TemplateGroup {
  vendor: string;
  productType: string;
  analysis: TemplateAnalysis;
}

/**
 * A real export library is not one file per brand. A single file often carries the whole catalogue,
 * so split it by vendor and product type and describe each group separately — one Atomic-skis
 * template and one Atomic-beanies template beats a single muddled Atomic one.
 *
 * Groups smaller than `minProducts` are dropped: two products are not a convention, they are a
 * coincidence, and a template built from them would apply a one-off tag to everything.
 */
export function analyseShopifyCsvGroups(text: string, minProducts = MIN_GROUP): { groups: TemplateGroup[]; warnings: string[] } {
  const { products, warnings, fatal } = readProducts(text);
  if (fatal) return { groups: [], warnings: [fatal] };

  const buckets = new Map<string, ProductRecord[]>();
  for (const p of products) {
    const key = `${norm(p.vendor)}\u0000${norm(p.productType)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }

  const groups: TemplateGroup[] = [];
  let skipped = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < minProducts) {
      skipped += bucket.length;
      continue;
    }
    const analysis = analyseProducts(bucket, []);
    groups.push({ vendor: analysis.vendor, productType: analysis.productType, analysis });
  }
  groups.sort((a, b) => b.analysis.productCount - a.analysis.productCount || a.vendor.localeCompare(b.vendor) || a.productType.localeCompare(b.productType));

  const all = [...warnings];
  if (skipped > 0) {
    all.push(
      `${skipped} product${skipped === 1 ? "" : "s"} sat in groups of fewer than ${minProducts}, too few to tell a convention from a one-off, so no template was proposed for them.`,
    );
  }
  if (groups.length === 0 && products.length > 0 && skipped === 0) all.push("No groups could be formed from this file.");
  return { groups, warnings: all };
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

/**
 * The written guidance that applies to one product: the shop's standing house rules, plus the
 * notes on every template it matches, plus the title style learned from real products.
 *
 * This is what turns a template from a tagger into something that can be explained to. A CSV shows
 * what fields were filled in; it cannot say "always lead the title with the model year" or "the
 * supplier's 'flex' number is the stiffness metafield". That has to be written down.
 */
export function templateGuidance(
  target: TemplateTarget,
  templates: ProductTemplateLike[],
  houseRules = "",
  titleExamples: string[] = [],
): string {
  const matched = matchingTemplates(target, templates);
  const lines: string[] = [];

  if (houseRules.trim()) lines.push(`House rules for every product:\n${houseRules.trim()}`);

  for (const template of matched) {
    const note = (template.notes ?? "").trim();
    if (note) lines.push(`Notes for ${template.name}:\n${note}`);
  }

  const examples = titleExamples.filter(Boolean).slice(0, 3);
  if (examples.length) {
    lines.push(`Existing titles in this range read like: ${examples.join(" · ")}. Match that shape.`);
  }

  return lines.join("\n\n");
}
