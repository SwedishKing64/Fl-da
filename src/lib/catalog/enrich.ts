/**
 * Filling in what the invoice left empty, from the brand's own website.
 *
 * A supplier invoice is a list of what was ordered. It carries a code, a colour, a size and a cost,
 * and almost never the description a customer reads or the price the brand recommends. Both are
 * published on the brand's own site, so they are looked up there.
 *
 * Only the empty columns are filled. The invoice is the authority on everything it actually states,
 * and a description someone has already written by hand is not overwritten by a machine.
 */

import { prisma } from "./db";
import { lookupProduct, lookupAvailable, bodyHtmlFrom, type ProductLookup } from "./extract/lookup";
import { repriceBatch } from "./pipeline";
import { logAudit } from "./audit";

/** How many lookups run at once. Each is a web search, so this is politeness, not throughput. */
const CONCURRENCY = 3;

/** A ceiling on one pass, so a 300-line pre-book order cannot quietly run for an hour. */
export const LOOKUP_LIMIT = 60;

/**
 * How long one pass may keep starting new lookups.
 *
 * A count is not a budget. Each lookup is a web search and takes tens of seconds, and a deployed
 * function is killed at its time limit whatever it was in the middle of — which is how a batch got
 * exported with no descriptions in it. So a pass stops starting work before it is stopped, leaves
 * the rest marked as never looked up, and says how many are left; running it again carries on.
 */
export const AUTOMATIC_BUDGET_MS = 40_000;
export const REQUESTED_BUDGET_MS = 240_000;

export interface LookupOutcome {
  /** Products that were missing a description or a retail price. */
  missing: number;
  /** Products looked up in this pass. */
  attempted: number;
  /** Products that came back with something. */
  found: number;
  /** Descriptions written. */
  descriptions: number;
  /** Retail prices found. */
  prices: number;
  /** Brands established for a product that had none. */
  vendors: number;
  /** True when the cap or the clock stopped the pass short of everything that is missing. */
  capped: boolean;
  /** Still missing and not yet looked up when the pass stopped. */
  remaining: number;
}

const EMPTY: LookupOutcome = { missing: 0, attempted: 0, found: 0, descriptions: 0, prices: 0, vendors: 0, capped: false, remaining: 0 };

type Candidate = {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  category: string;
  bodyHtml: string;
  variants: { id: string; sku: string; retailOverride: number | null }[];
};

/** A product wants a lookup when it has no description, no retail price, or no brand. */
function wants(p: Candidate): boolean {
  return !p.bodyHtml.trim() || !p.vendor.trim() || p.variants.every((v) => v.retailOverride === null);
}

async function candidates(batchId: string, productIds?: string[]): Promise<Candidate[]> {
  const rows = await prisma.product.findMany({
    where: productIds?.length ? { batchId, id: { in: productIds } } : { batchId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, title: true, vendor: true, productType: true, category: true, bodyHtml: true,
      variants: { select: { id: true, sku: true, retailOverride: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  return rows;
}

/**
 * Look up everything in a batch that is still missing a description, a brand or a price.
 *
 * Products already looked up are left alone unless asked for by name, so running this twice does
 * not pay for the same searches again; `retry` takes another run at the ones that came back empty.
 */
export async function lookupBatch(
  batchId: string,
  opts: { productIds?: string[]; retry?: boolean; userId?: string | null; budgetMs?: number } = {},
): Promise<LookupOutcome> {
  if (!lookupAvailable()) return { ...EMPTY };

  const all = await candidates(batchId, opts.productIds);
  const named = Boolean(opts.productIds?.length);
  // Asked for by name means look it up whatever its state; otherwise only what is still missing.
  const wanting = named ? all : all.filter(wants);

  // Skip what a previous pass already answered, unless this is a retry or a named product.
  const already = named || opts.retry
    ? new Set<string>()
    : new Set((await prisma.product.findMany({ where: { batchId, lookupStatus: { not: "NONE" } }, select: { id: true } })).map((p) => p.id));
  const todo = wanting.filter((p) => !already.has(p.id));

  const out: LookupOutcome = { ...EMPTY, missing: wanting.length, capped: todo.length > LOOKUP_LIMIT, remaining: todo.length };
  const work = todo.slice(0, LOOKUP_LIMIT);
  if (work.length === 0) return out;

  const deadline = Date.now() + (opts.budgetMs ?? REQUESTED_BUDGET_MS);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, work.length) }, async () => {
    for (let i = next++; i < work.length; i = next++) {
      // Checked before starting, never in the middle: a lookup that has begun is allowed to finish
      // and be written down, so a pass never leaves a product half-filled.
      if (Date.now() >= deadline) { out.capped = true; return; }
      const applied = await lookupOne(work[i]);
      out.attempted++;
      if (!applied) continue;
      out.found++;
      if (applied.description) out.descriptions++;
      if (applied.price) out.prices++;
      if (applied.vendor) out.vendors++;
    }
  });
  await Promise.all(workers);
  out.remaining = Math.max(0, todo.length - out.attempted);

  if (out.prices > 0) await repriceBatch(batchId);
  await logAudit("batch.lookup", { batchId, userId: opts.userId ?? null, details: { ...out } });
  return out;
}

/** One product: search, then write only into the columns still empty. */
async function lookupOne(p: Candidate): Promise<{ description: boolean; price: boolean; vendor: boolean } | null> {
  let found: ProductLookup | null = null;
  try {
    found = await lookupProduct({
      title: p.title,
      brandHint: p.vendor || undefined,
      modelCode: p.variants.map((v) => v.sku).find(Boolean) || undefined,
      category: p.productType || p.category || undefined,
    });
  } catch {
    await prisma.product.update({ where: { id: p.id }, data: { lookupStatus: "FAILED", lookupAt: new Date() } });
    return null;
  }

  if (!found) {
    await prisma.product.update({ where: { id: p.id }, data: { lookupStatus: "NOT_FOUND", lookupAt: new Date() } });
    return null;
  }

  const body = bodyHtmlFrom(found);
  const writeBody = !p.bodyHtml.trim() && body.length > 0;
  // A brand or a price is a claim about the product, so an unsure match may not make one.
  const writeVendor = found.confident && !p.vendor.trim() && found.vendor.trim().length > 0;
  const price = typeof found.rrp === "number" && found.rrp > 0 ? found.rrp : null;
  const pricedVariants = found.confident && price !== null ? p.variants.filter((v) => v.retailOverride === null) : [];

  await prisma.product.update({
    where: { id: p.id },
    data: {
      ...(writeBody ? { bodyHtml: body } : {}),
      ...(writeVendor ? { vendor: found.vendor.trim() } : {}),
      lookupStatus: found.confident ? "FOUND" : body ? "UNSURE" : "NOT_FOUND",
      lookupSource: found.sourceUrl.trim(),
      lookupAt: new Date(),
    },
  });
  if (pricedVariants.length > 0) {
    await prisma.variant.updateMany({ where: { id: { in: pricedVariants.map((v) => v.id) } }, data: { retailOverride: price } });
  }

  return { description: writeBody, price: pricedVariants.length > 0, vendor: writeVendor };
}

/** Whether the button that runs this should be offered at all. */
export function lookupEnabled(): boolean {
  return lookupAvailable();
}
