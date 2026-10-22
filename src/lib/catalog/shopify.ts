// Shopify Admin API (GraphQL) integration: catalog sync for duplicate detection,
// reconciliation, direct push, and rollback. Uses fetch against the Admin GraphQL endpoint
// with a custom-app access token configured in Settings.

import { prisma, parseJson } from "./db";
import { getSettings } from "./settings";
import { logAudit } from "./audit";
import { loadReview, toCsvProducts } from "./pipeline";
import { candidatesFor, type CatalogueRow, type MatchCandidate } from "./match-candidates";
import type { ReviewProduct } from "./review-types";
import { SKI_METAFIELDS, type ShopifyLocation } from "./types";
import { blockingErrors } from "./validate";
import { offTotals } from "./totals";

export interface ShopifyConfig {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
}

export class ShopifyError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ShopifyError";
  }
}

export async function shopifyConfig(): Promise<ShopifyConfig> {
  const s = await getSettings();
  if (!s.shopify.storeDomain || !s.shopify.accessToken) throw new ShopifyError("Shopify is not configured. Add the store domain and Admin API token in Settings.");
  return { storeDomain: s.shopify.storeDomain.replace(/^https?:\/\//, "").replace(/\/+$/, ""), accessToken: s.shopify.accessToken, apiVersion: s.shopify.apiVersion || "2025-07" };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
}

export async function graphql<T>(cfg: ShopifyConfig, query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://${cfg.storeDomain}/admin/api/${cfg.apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.accessToken },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new ShopifyError(`Could not reach ${cfg.storeDomain} (${err instanceof Error && err.name === "TimeoutError" ? "timed out" : err instanceof Error ? err.message : String(err)}). Check the store domain and network.`);
  }
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return graphql(cfg, query, variables, attempt + 1);
  }
  if (!res.ok) throw new ShopifyError(`Shopify API HTTP ${res.status}`, await res.text().catch(() => ""));
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    if (body.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      return graphql(cfg, query, variables, attempt + 1);
    }
    throw new ShopifyError(body.errors.map((e) => e.message).join("; "), body.errors);
  }
  if (!body.data) throw new ShopifyError("Empty response from Shopify");
  return body.data;
}

// ---------------------------------------------------------------------------
// Catalog sync (read-only) -> ShopifyCatalogItem cache
// ---------------------------------------------------------------------------

interface ProductsPage {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      handle: string;
      title: string;
      vendor: string;
      variants: { nodes: Array<{ id: string; sku: string | null; barcode: string | null; price: string; selectedOptions: Array<{ name: string; value: string }>; inventoryItem: { id: string } }> };
    }>;
  };
}

const PRODUCTS_QUERY = `query Products($after: String) {
  products(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title vendor
      variants(first: 100) { nodes { id sku barcode price selectedOptions { name value } inventoryItem { id } } }
    }
  }
}`;

export async function syncCatalog(userId: string | null): Promise<{ products: number; variants: number }> {
  const cfg = await shopifyConfig();
  let after: string | null = null;
  let products = 0;
  let variants = 0;
  const seen: string[] = [];
  do {
    const data: ProductsPage = await graphql<ProductsPage>(cfg, PRODUCTS_QUERY, { after });
    for (const p of data.products.nodes) {
      products++;
      for (const v of p.variants.nodes) {
        variants++;
        seen.push(v.id);
        const opts = v.selectedOptions.map((o) => o.value);
        await prisma.shopifyCatalogItem.upsert({
          where: { shopifyVariantId: v.id },
          create: { shopifyProductId: p.id, shopifyVariantId: v.id, inventoryItemId: v.inventoryItem?.id ?? null, handle: p.handle, title: p.title, vendor: p.vendor, sku: v.sku ?? "", barcode: v.barcode ?? "", price: Number(v.price), option1: opts[0] ?? null, option2: opts[1] ?? null, option3: opts[2] ?? null, syncedAt: new Date() },
          update: { shopifyProductId: p.id, inventoryItemId: v.inventoryItem?.id ?? null, handle: p.handle, title: p.title, vendor: p.vendor, sku: v.sku ?? "", barcode: v.barcode ?? "", price: Number(v.price), option1: opts[0] ?? null, option2: opts[1] ?? null, option3: opts[2] ?? null, syncedAt: new Date() },
        });
      }
    }
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  await prisma.shopifyCatalogItem.deleteMany({ where: { shopifyVariantId: { notIn: seen } } });
  await logAudit("shopify.synced", { userId, details: { products, variants } });
  return { products, variants };
}

export async function fetchLocations(): Promise<ShopifyLocation[]> {
  const cfg = await shopifyConfig();
  const data = await graphql<{ locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> } }>(cfg, `{ locations(first: 50) { nodes { id name isActive } } }`);
  return data.locations.nodes.filter((l) => l.isActive).map((l, i) => ({ id: l.id, name: l.name, isDefault: i === 0 }));
}

// ---------------------------------------------------------------------------
// Reconcile: classify each product/variant against the cached catalog
// ---------------------------------------------------------------------------

export interface ReconcileCounts { new: number; variantAdd: number; update: number; ambiguous: number }

/**
 * What the batch is checked against: the store's own catalogue when a store is connected and has
 * been read, otherwise the listings learned from the shop's export. The export carries handles
 * and barcodes, which is enough to say "the shop already sells this", if not which variant.
 */
async function catalogueRows(): Promise<{ rows: CatalogueRow[]; live: boolean }> {
  const items = await prisma.shopifyCatalogItem.findMany();
  if (items.length > 0) return { live: true, rows: items.map((m) => ({ id: m.shopifyProductId, handle: m.handle, title: m.title, sku: m.sku, barcode: m.barcode })) };
  const listings = await prisma.shopListing.findMany({ select: { handle: true, title: true, barcodes: true } });
  const rows: CatalogueRow[] = [];
  for (const l of listings) {
    const codes = l.barcodes.split(",").map((b) => b.trim()).filter(Boolean);
    if (codes.length === 0) rows.push({ id: `listing:${l.handle}`, handle: l.handle, title: l.title, sku: "", barcode: "" });
    for (const b of codes) rows.push({ id: `listing:${l.handle}`, handle: l.handle, title: l.title, sku: "", barcode: b });
  }
  return { live: false, rows };
}

/** Whether there is anything at all to check a batch against. */
export async function catalogueKnown(): Promise<boolean> {
  const settings = await getSettings();
  if (settings.shopify.storeDomain && settings.shopify.accessToken) return true;
  return (await prisma.shopListing.count()) > 0;
}

const CACHE_FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Read the store again when the copy of it is a day old or missing. The check used to read the
 * store once, the first time, and never again, so a product added in the store last week looked
 * new to every batch after.
 */
export async function refreshCatalogueIfStale(userId: string | null): Promise<void> {
  const settings = await getSettings();
  if (!(settings.shopify.storeDomain && settings.shopify.accessToken)) return;
  const newest = await prisma.shopifyCatalogItem.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } });
  if (newest && Date.now() - newest.syncedAt.getTime() < CACHE_FRESH_MS) return;
  await syncCatalog(userId);
}

/**
 * Classify each product against what the shop already sells. One match is taken; none is a new
 * product; more than one is a question for a person, and until it is answered the product is
 * AMBIGUOUS, which stops the export. A decision somebody made is kept across checks.
 */
export async function reconcileBatch(batchId: string): Promise<ReconcileCounts> {
  const products = await prisma.product.findMany({ where: { batchId }, include: { variants: true } });
  const { rows, live } = await catalogueRows();
  const counts: ReconcileCounts = { new: 0, variantAdd: 0, update: 0, ambiguous: 0 };
  for (const p of products) {
    if (p.matchDecided) {
      if (p.reconcileStatus === "NEW") counts.new++;
      else if (p.reconcileStatus === "VARIANT_ADD") counts.variantAdd++;
      else counts.update++;
      continue;
    }
    const candidates = candidatesFor(p, rows);
    if (candidates.length === 0) {
      counts.new++;
      await setNew(p.id, "[]");
      continue;
    }
    if (candidates.length > 1) {
      counts.ambiguous++;
      await prisma.product.update({ where: { id: p.id }, data: { reconcileStatus: "AMBIGUOUS", shopifyProductId: null, matchCandidates: JSON.stringify(candidates) } });
      await prisma.variant.updateMany({ where: { productId: p.id }, data: { reconcileStatus: "UNKNOWN", shopifyVariantId: null, shopifyInventoryItemId: null } });
      continue;
    }
    const status = await attachTo(p, candidates[0], live, JSON.stringify(candidates));
    if (status === "VARIANT_ADD") counts.variantAdd++;
    else counts.update++;
  }
  return counts;
}

async function setNew(productId: string, candidatesJson: string): Promise<void> {
  await prisma.product.update({ where: { id: productId }, data: { reconcileStatus: "NEW", shopifyProductId: null, matchCandidates: candidatesJson } });
  await prisma.variant.updateMany({ where: { productId }, data: { reconcileStatus: "NEW", shopifyVariantId: null, shopifyInventoryItemId: null } });
}

/**
 * Attach a product to the one it is in the shop. Against the store's own catalogue each variant
 * is placed by SKU, or by its option values — the shop does not use SKUs, so on their own they
 * recognise almost nothing — and what is not placed is a variant to add. Against the shop's
 * export only the product is known, so it is an update by handle and the variants are left open.
 * The handle is set to the shop's, because that is what the CSV updates by.
 */
async function attachTo(p: { id: string; handle: string; variants: Array<{ id: string; sku: string; option1Value: string | null; option2Value: string | null; option3Value: string | null }> }, c: MatchCandidate, live: boolean, candidatesJson: string): Promise<"UPDATE" | "VARIANT_ADD"> {
  if (!live || c.id.startsWith("listing:")) {
    await prisma.product.update({ where: { id: p.id }, data: { reconcileStatus: "UPDATE", shopifyProductId: null, handle: c.handle, matchCandidates: candidatesJson } });
    await prisma.variant.updateMany({ where: { productId: p.id }, data: { reconcileStatus: "UNKNOWN", shopifyVariantId: null, shopifyInventoryItemId: null } });
    return "UPDATE";
  }
  const matches = await prisma.shopifyCatalogItem.findMany({ where: { shopifyProductId: c.id } });
  const bySku = new Map(matches.filter((m) => m.sku).map((m) => [m.sku.toLowerCase(), m]));
  const byOptions = new Map(matches.map((m) => [optionKey([m.option1, m.option2, m.option3]), m]));
  let anyNew = false;
  for (const v of p.variants) {
    const m = (v.sku ? bySku.get(v.sku.trim().toLowerCase()) : undefined) ?? byOptions.get(optionKey([v.option1Value, v.option2Value, v.option3Value]));
    if (m) await prisma.variant.update({ where: { id: v.id }, data: { reconcileStatus: "UPDATE", shopifyVariantId: m.shopifyVariantId, shopifyInventoryItemId: m.inventoryItemId } });
    else {
      anyNew = true;
      await prisma.variant.update({ where: { id: v.id }, data: { reconcileStatus: "VARIANT_ADD", shopifyVariantId: null, shopifyInventoryItemId: null } });
    }
  }
  const status = anyNew ? "VARIANT_ADD" : "UPDATE";
  await prisma.product.update({ where: { id: p.id }, data: { reconcileStatus: status, shopifyProductId: c.id, handle: c.handle, matchCandidates: candidatesJson } });
  return status;
}

/**
 * A person's answer to "which is it": one of the candidates, or none of them. Kept across later
 * checks (`matchDecided`), and offered again in the drawer in case it was wrong.
 */
export async function decideMatch(productId: string, choice: "new" | string): Promise<void> {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: true } });
  const candidates = JSON.parse(p.matchCandidates || "[]") as MatchCandidate[];
  if (choice === "new") await setNew(p.id, p.matchCandidates);
  else {
    const c = candidates.find((x) => x.id === choice);
    if (!c) throw new Error("That is not one of the products this could be. Run the check again.");
    await attachTo(p, c, (await prisma.shopifyCatalogItem.count()) > 0, p.matchCandidates);
  }
  await prisma.product.update({ where: { id: productId }, data: { matchDecided: true } });
}

// ---------------------------------------------------------------------------
// Direct push
// ---------------------------------------------------------------------------

export interface ProductSetInput {
  id?: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "ACTIVE" | "DRAFT";
  seo: { title: string; description: string };
  productOptions?: Array<{ name: string; values: Array<{ name: string }> }>;
  variants: Array<{
    sku: string;
    barcode?: string;
    price: string;
    compareAtPrice?: string | null;
    optionValues?: Array<{ optionName: string; name: string }>;
    inventoryItem: { cost: string; tracked: boolean; measurement?: { weight: { unit: "GRAMS"; value: number } } };
    inventoryQuantities?: Array<{ locationId: string; name: "available"; quantity: number }>;
  }>;
  files?: Array<{ originalSource: string; contentType: "IMAGE"; alt: string }>;
  metafields?: Array<{ namespace: string; key: string; type: string; value: string }>;
}

/** Pure: build the productSet input for a reviewed product. */
export function buildProductSetInput(p: ReviewProduct, opts: { publish: boolean; locationId: string | null; locationQuantities?: Record<string, Record<string, number>> }): ProductSetInput {
  const optionNames = [p.option1Name, p.option2Name, p.option3Name].filter((n): n is string => Boolean(n && n.trim()));
  const productOptions = optionNames.map((name, i) => ({
    name,
    values: Array.from(new Set(p.variants.map((v) => [v.option1Value, v.option2Value, v.option3Value][i] ?? "").filter(Boolean))).map((n) => ({ name: n })),
  }));
  const input: ProductSetInput = {
    handle: p.handle,
    title: p.title,
    descriptionHtml: p.bodyHtml,
    vendor: p.vendor,
    productType: p.productType,
    tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean),
    status: opts.publish ? "ACTIVE" : "DRAFT",
    seo: { title: p.seoTitle, description: p.seoDescription },
    variants: p.variants.map((v) => {
      const perLocation = opts.locationQuantities?.[v.id];
      const quantities = perLocation && Object.keys(perLocation).length
        ? Object.entries(perLocation).map(([locationId, quantity]) => ({ locationId, name: "available" as const, quantity }))
        : opts.locationId ? [{ locationId: opts.locationId, name: "available" as const, quantity: v.quantity }] : undefined;
      return {
        sku: v.sku,
        barcode: v.barcode || undefined,
        price: v.retailPrice.toFixed(2),
        compareAtPrice: v.compareAtPrice && v.compareAtPrice > v.retailPrice ? v.compareAtPrice.toFixed(2) : null,
        optionValues: optionNames.length ? optionNames.map((name, i) => ({ optionName: name, name: [v.option1Value, v.option2Value, v.option3Value][i] ?? "" })) : undefined,
        inventoryItem: { cost: v.landedCostAud.toFixed(2), tracked: true, ...(v.grams > 0 ? { measurement: { weight: { unit: "GRAMS" as const, value: v.grams } } } : {}) },
        inventoryQuantities: quantities,
      };
    }),
  };
  if (productOptions.length) input.productOptions = productOptions;
  if (p.shopifyProductId) input.id = p.shopifyProductId;
  const files = p.images.map((i) => ({ originalSource: i.url, contentType: "IMAGE" as const, alt: p.title }));
  if (files.length) input.files = files;
  const metafields = SKI_METAFIELDS.filter((d) => p.metafields[d.key]).map((d) => ({ namespace: d.namespace, key: d.key, type: d.type, value: p.metafields[d.key] }));
  if (metafields.length) input.metafields = metafields;
  return input;
}

const PRODUCT_SET = `mutation ProductSet($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle variants(first: 100) { nodes { id sku inventoryItem { id } } } }
    userErrors { field message }
  }
}`;

const COLLECTIONS_QUERY = `query Collections($after: String) { collections(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { id title } } }`;
const COLLECTION_ADD = `mutation AddToCollection($id: ID!, $productIds: [ID!]!) { collectionAddProductsV2(id: $id, productIds: $productIds) { userErrors { field message } } }`;

export interface PushResult {
  ok: boolean;
  errors: string[];
  created: number;
  updated: number;
}

/**
 * Push a reviewed batch to Shopify via productSet. NEW products are created; products that
 * reconcile to an existing Shopify product are updated in place (productSet with id replaces
 * the product's variant set, which is why reconcile must run first and the user must confirm).
 */
export async function pushBatch(batchId: string, userId: string, opts: { confirm: boolean; overrideWarnings: boolean }): Promise<PushResult> {
  if (!opts.confirm) return { ok: false, errors: ["Push not confirmed."], created: 0, updated: 0 };
  const cfg = await shopifyConfig();
  const settings = await getSettings();
  const review = await loadReview(batchId);
  const errors = blockingErrors(review.products);
  if (errors.length) return { ok: false, errors, created: 0, updated: 0 };
  const hasWarnings = review.products.some((p) => p.flags.length || p.variants.some((v) => v.flags.length));
  if (hasWarnings && !opts.overrideWarnings) return { ok: false, errors: ["Batch has warnings; confirm the override to push anyway."], created: 0, updated: 0 };
  // A document whose lines did not add up to its own totals, not settled on the review page.
  const off = (await prisma.sourceFile.findMany({ where: { batchId, extractionError: { contains: "Does not add up:" } }, select: { filename: true, extractionError: true } })).filter((f) => offTotals(f.extractionError));
  if (off.length && !opts.overrideWarnings) return { ok: false, errors: [`${off.map((f) => f.filename).join(", ")} ${off.length === 1 ? "does" : "do"} not add up to ${off.length === 1 ? "its" : "their"} own totals; settle ${off.length === 1 ? "it" : "them"} on the review page, or confirm the override to push anyway.`], created: 0, updated: 0 };

  const locationId = settings.locations.find((l) => l.isDefault)?.id ?? settings.locations[0]?.id ?? null;
  const locationQuantities: Record<string, Record<string, number>> = {};
  for (const p of review.products) {
    for (const v of p.variants) {
      const row = await prisma.variant.findUnique({ where: { id: v.id }, select: { locationQuantities: true } });
      const lq = parseJson<Record<string, number>>(row?.locationQuantities, {});
      if (Object.keys(lq).length) locationQuantities[v.id] = lq;
    }
  }

  const collections = new Map<string, string>();
  try {
    let after: string | null = null;
    do {
      const data: { collections: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ id: string; title: string }> } } = await graphql(cfg, COLLECTIONS_QUERY, { after });
      for (const c of data.collections.nodes) collections.set(c.title.toLowerCase(), c.id);
      after = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
    } while (after);
  } catch {
    // Collections are optional; continue without them.
  }

  const snapshot: Array<{ productId: string; shopifyProductId: string; action: "CREATED" | "UPDATED"; before: unknown }> = [];
  let created = 0;
  let updated = 0;
  const failures: string[] = [];
  for (const p of review.products) {
    // Pushed straight to the store, a product still arrives as a draft: nothing reaches a customer
    // until a person has looked at it.
    const input = buildProductSetInput(p, { publish: false, locationId, locationQuantities });
    const before = p.shopifyProductId ? await prisma.shopifyCatalogItem.findMany({ where: { shopifyProductId: p.shopifyProductId } }) : null;
    try {
      const data = await graphql<{ productSet: { product: { id: string; handle: string; variants: { nodes: Array<{ id: string; sku: string; inventoryItem: { id: string } }> } } | null; userErrors: Array<{ field: string[] | null; message: string }> } }>(cfg, PRODUCT_SET, { input });
      if (data.productSet.userErrors.length || !data.productSet.product) {
        failures.push(`${p.title}: ${data.productSet.userErrors.map((e) => e.message).join("; ") || "unknown error"}`);
        continue;
      }
      const product = data.productSet.product;
      const action = p.shopifyProductId ? "UPDATED" : "CREATED";
      if (action === "CREATED") created++;
      else updated++;
      snapshot.push({ productId: p.id, shopifyProductId: product.id, action, before });
      await prisma.product.update({ where: { id: p.id }, data: { shopifyProductId: product.id, reconcileStatus: action === "CREATED" ? "NEW" : "UPDATE" } });
      for (const sv of product.variants.nodes) {
        const local = p.variants.find((v) => v.sku && v.sku === sv.sku);
        if (local) await prisma.variant.update({ where: { id: local.id }, data: { shopifyVariantId: sv.id, shopifyInventoryItemId: sv.inventoryItem?.id ?? null } });
      }
      for (const title of p.collections.split(",").map((c) => c.trim()).filter(Boolean)) {
        const id = collections.get(title.toLowerCase());
        if (id) await graphql(cfg, COLLECTION_ADD, { id, productIds: [product.id] }).catch(() => undefined);
      }
    } catch (err) {
      failures.push(`${p.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await logAudit("batch.pushed", { batchId, userId, details: { created, updated, failures, snapshot } });
  if (failures.length === 0) await prisma.importBatch.update({ where: { id: batchId }, data: { status: "PUSHED", exportedAt: new Date() } });
  return { ok: failures.length === 0, errors: failures, created, updated };
}

// ---------------------------------------------------------------------------
// Rollback of a pushed batch
// ---------------------------------------------------------------------------

const PRODUCT_DELETE = `mutation Del($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`;
const VARIANTS_BULK_UPDATE = `mutation Upd($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`;

/**
 * Undo the most recent push: delete products this batch created, and restore price/compare-at
 * on variants it updated (from the pre-push catalog snapshot). Inventory is left as-is.
 */
export async function rollbackBatch(batchId: string, userId: string): Promise<{ deleted: number; restored: number; errors: string[] }> {
  const cfg = await shopifyConfig();
  const log = await prisma.auditLog.findFirst({ where: { batchId, action: "batch.pushed" }, orderBy: { createdAt: "desc" } });
  if (!log) return { deleted: 0, restored: 0, errors: ["This batch has not been pushed to Shopify."] };
  const details = parseJson<{ snapshot: Array<{ productId: string; shopifyProductId: string; action: "CREATED" | "UPDATED"; before: Array<{ shopifyVariantId: string; price: number | null }> | null }> }>(log.details, { snapshot: [] });
  let deleted = 0;
  let restored = 0;
  const errors: string[] = [];
  for (const entry of details.snapshot) {
    try {
      if (entry.action === "CREATED") {
        const data = await graphql<{ productDelete: { deletedProductId: string | null; userErrors: Array<{ message: string }> } }>(cfg, PRODUCT_DELETE, { input: { id: entry.shopifyProductId } });
        if (data.productDelete.userErrors.length) errors.push(data.productDelete.userErrors.map((e) => e.message).join("; "));
        else deleted++;
        await prisma.product.update({ where: { id: entry.productId }, data: { shopifyProductId: null, reconcileStatus: "NEW" } }).catch(() => undefined);
      } else if (entry.before?.length) {
        const variants = entry.before.filter((b) => b.price !== null).map((b) => ({ id: b.shopifyVariantId, price: Number(b.price).toFixed(2) }));
        if (variants.length) {
          const data = await graphql<{ productVariantsBulkUpdate: { userErrors: Array<{ message: string }> } }>(cfg, VARIANTS_BULK_UPDATE, { productId: entry.shopifyProductId, variants });
          if (data.productVariantsBulkUpdate.userErrors.length) errors.push(data.productVariantsBulkUpdate.userErrors.map((e) => e.message).join("; "));
          else restored += variants.length;
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "ROLLED_BACK" } });
  await logAudit("batch.rolled_back", { batchId, userId, details: { deleted, restored, errors } });
  return { deleted, restored, errors };
}

export { toCsvProducts };

/** A variant's identity on a product it is already on: the option values, however they are cased. */
function optionKey(values: Array<string | null>): string {
  return values.map((v) => (v ?? "").trim().toLowerCase()).join("\u0000");
}
