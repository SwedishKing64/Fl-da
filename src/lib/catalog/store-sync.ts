/**
 * The store as the source of truth, synced rather than told.
 *
 * A shop used to teach Flöda how it files, tags and names products by exporting its catalogue to
 * a file and uploading it, and the file was as old as the day it was made. With the store
 * connected, the same lessons are read off the store itself: its listings (for placing an order
 * line on what the shop already sells), its vocabulary (which kinds of product it has, which tags
 * go with each, how each is spelled), and the conventions per brand and kind (the templates). The
 * read happens when the store has not been read for a day, before a batch is built, so a product
 * added in the store last week is known to this week's batch; and on demand from Training.
 *
 * The connection reads and, on the export page, pushes drafts; it never changes a listing on its
 * own. An export file still works for a shop that would rather not connect.
 */

import { prisma, parseJson } from "./db";
import { getSettings } from "./settings";
import { logAudit } from "./audit";
import { graphql, shopifyConfig, syncCatalog, ShopifyError } from "./shopify";
import { rememberListings } from "./shop-memory-store";
import { learnVocabulary, mergeVocabulary } from "./learn";
import { getLearnedVocabulary, saveLearnedVocabulary, saveShopProfile } from "./shop-profile";
import { analyseProductGroups, type ProductRecord } from "./templates";
import type { Listing } from "./shop-memory";

const STORE_KEY = "shop.store";
const STALE_MS = 24 * 60 * 60 * 1000;
/** What a template made from the store is filed under, so a later read replaces it and an export's templates stay. */
export const STORE_TEMPLATE_SOURCE = "store";

export interface StoreNode {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  descriptionHtml: string;
  seo: { title: string | null; description: string | null };
  options: Array<{ name: string }>;
  collections: { nodes: Array<{ title: string }> };
  variants: { nodes: Array<{ sku: string | null; barcode: string | null; price: string; compareAtPrice: string | null; selectedOptions: Array<{ name: string; value: string }> }> };
}

interface StorePage { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: StoreNode[] } }

const STORE_QUERY = `query Store($after: String) {
  products(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title vendor productType tags descriptionHtml
      seo { title description }
      options { name }
      collections(first: 10) { nodes { title } }
      variants(first: 100) { nodes { sku barcode price compareAtPrice selectedOptions { name value } } }
    }
  }
}`;

/** A store's products as listings: what the export gave, read live. */
export function toListings(nodes: StoreNode[]): Listing[] {
  return nodes.map((p) => {
    const first = p.variants.nodes[0];
    const compare = first?.compareAtPrice ? Number(first.compareAtPrice) : null;
    const price = compare && compare > 0 ? compare : first ? Number(first.price) : null;
    const binding = first?.selectedOptions.find((o) => /binding/i.test(o.name))?.value ?? "";
    return {
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      productType: p.productType,
      tags: p.tags.map((t) => t.trim()).filter(Boolean),
      price: price !== null && Number.isFinite(price) ? price : null,
      bindingOption: binding,
      barcodes: p.variants.nodes.map((v) => (v.barcode ?? "").trim()).filter(Boolean),
    };
  });
}

/** A store's products as the records the template analysis reads. */
export function toRecords(nodes: StoreNode[]): ProductRecord[] {
  return nodes.map((p) => ({
    vendor: p.vendor,
    productType: p.productType,
    tags: p.tags.map((t) => t.trim()).filter(Boolean),
    collections: p.collections.nodes.map((c) => c.title),
    optionNames: p.options.map((o) => o.name).filter((n) => n && n.toLowerCase() !== "title"),
    metafields: {},
    title: p.title,
    seoTitle: p.seo.title ?? "",
    seoDescription: p.seo.description ?? "",
    body: p.descriptionHtml ?? "",
  }));
}

/** Every product on the store, page by page. */
export async function readStore(): Promise<StoreNode[]> {
  const cfg = await shopifyConfig();
  const nodes: StoreNode[] = [];
  let after: string | null = null;
  do {
    const data: StorePage = await graphql<StorePage>(cfg, STORE_QUERY, { after });
    nodes.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after && nodes.length < 20000);
  return nodes;
}

export interface StoreState {
  configured: boolean;
  domain: string;
  tokenTail: string;
  syncedAt: string | null;
  products: number;
  types: number;
  templates: number;
}

/** Where the connection stands: whether there is one, and what the last read found. */
export async function storeState(): Promise<StoreState> {
  const s = await getSettings();
  const row = await prisma.appSetting.findUnique({ where: { key: STORE_KEY } }).catch(() => null);
  const last = parseJson<{ syncedAt?: string; products?: number; types?: number; templates?: number }>(row?.value, {});
  const token = s.shopify.accessToken ?? "";
  return {
    configured: Boolean(s.shopify.storeDomain && token),
    domain: s.shopify.storeDomain ?? "",
    tokenTail: token.length > 8 ? `…${token.slice(-4)}` : "",
    syncedAt: last.syncedAt ?? null,
    products: last.products ?? 0,
    types: last.types ?? 0,
    templates: last.templates ?? 0,
  };
}

/** Ask the store its name: the one call that proves the domain and the token are right. */
export async function testStore(): Promise<{ name: string; domain: string }> {
  const cfg = await shopifyConfig();
  const data = await graphql<{ shop: { name: string; myshopifyDomain: string } }>(cfg, `{ shop { name myshopifyDomain } }`);
  return { name: data.shop.name, domain: data.shop.myshopifyDomain };
}

export interface StoreSync { products: number; variants: number; types: number; templates: number }

/**
 * Read the store and keep what it teaches: its listings, its vocabulary, its templates per brand
 * and kind, and the catalogue the batch check matches against. Everything the export taught
 * stays and is joined; what an earlier read of the store made is replaced.
 */
export async function syncStore(userId: string | null): Promise<StoreSync> {
  const nodes = await readStore();
  const listings = toListings(nodes);
  await rememberListings(listings);

  const learned = learnVocabulary(listings, "your store");
  const before = await getLearnedVocabulary();
  await saveLearnedVocabulary(before ? mergeVocabulary(before, learned) : learned);
  await saveShopProfile({ skipped: { learn: false } });

  const { groups } = analyseProductGroups(toRecords(nodes));
  await prisma.productTemplate.deleteMany({ where: { sourceFileName: STORE_TEMPLATE_SOURCE } });
  let templates = 0;
  for (const g of groups.slice(0, 1500)) {
    const a = g.analysis;
    const vendor = g.vendor.trim().slice(0, 120);
    const productType = g.productType.trim().slice(0, 120);
    if (!vendor && !productType) continue;
    await prisma.productTemplate.create({
      data: {
        name: [vendor, productType].filter(Boolean).join(" · ").slice(0, 160),
        scope: vendor ? "BRAND" : "PRODUCT_TYPE",
        matchValue: vendor || productType,
        matchProductType: vendor ? productType : "",
        sourceFileName: STORE_TEMPLATE_SOURCE,
        productCount: a.productCount,
        setProductType: productType,
        addTags: a.commonTags.slice(0, 40).join(", "),
        addCollections: a.collections.slice(0, 20).join(", "),
        optionNames: a.optionNames.slice(0, 3).join(", "),
        setMetafields: JSON.stringify(a.metafields ?? {}),
        analysis: JSON.stringify({ ...a, tagCounts: a.tagCounts.slice(0, 60) }),
        priority: Math.min(a.productCount, 1000),
        active: true,
      },
    });
    templates++;
  }

  const catalogue = await syncCatalog(userId);
  const out: StoreSync = { products: listings.length, variants: catalogue.variants, types: learned.types.length, templates };
  const value = JSON.stringify({ syncedAt: new Date().toISOString(), products: out.products, types: out.types, templates: out.templates });
  await prisma.appSetting.upsert({ where: { key: STORE_KEY }, create: { key: STORE_KEY, value }, update: { value } });
  await logAudit("store.synced", { userId, details: out });
  return out;
}

/** Read the store again when it has not been read for a day. Never fails a build: a store that cannot be reached is logged and the build goes on with what it has. */
export async function refreshStoreIfStale(userId: string | null): Promise<StoreSync | null> {
  const state = await storeState();
  if (!state.configured) return null;
  if (state.syncedAt && Date.now() - new Date(state.syncedAt).getTime() < STALE_MS) return null;
  try {
    return await syncStore(userId);
  } catch (err) {
    console.warn("[store] could not read the store:", err instanceof ShopifyError ? err.message : err instanceof Error ? err.message : err);
    return null;
  }
}

/** Forget the connection and what the store's reads made; what an export taught stays. */
export async function forgetStore(): Promise<void> {
  const { saveSettings } = await import("./settings");
  await saveSettings({ shopify: { storeDomain: "", accessToken: "", apiVersion: (await getSettings()).shopify.apiVersion } });
  await prisma.productTemplate.deleteMany({ where: { sourceFileName: STORE_TEMPLATE_SOURCE } });
  await prisma.appSetting.deleteMany({ where: { key: STORE_KEY } });
}
