/**
 * Keeping the shop's own listings, wherever an export of them turns up — the Bulk page, or dropped
 * into an import batch beside the supplier's files. See shop-memory.ts for what is done with them.
 */

import { prisma } from "./db";
import type { Listing } from "./shop-memory";

export async function rememberListings(listings: Listing[]): Promise<number> {
  const clean = listings.filter((l) => l.handle.trim() && l.title.trim()).slice(0, 20000);
  for (let at = 0; at < clean.length; at += 500) {
    const chunk = clean.slice(at, at + 500);
    await prisma.$transaction([
      prisma.shopListing.deleteMany({ where: { handle: { in: chunk.map((l) => l.handle.trim()) } } }),
      prisma.shopListing.createMany({
        data: chunk.map((l) => ({
          handle: l.handle.trim(), title: l.title.trim(), vendor: l.vendor.trim(), productType: l.productType.trim(),
          tags: l.tags.join(", "), price: typeof l.price === "number" ? l.price : null, bindingOption: (l.bindingOption ?? "").trim(),
        })),
      }),
    ]);
  }
  return clean.length;
}

/** A Shopify product export, as against a supplier's file: it has the importer's own columns. */
export function isShopifyExport(csvHeader: string[]): boolean {
  const h = new Set(csvHeader.map((c) => c.trim()));
  return h.has("Handle") && h.has("Title") && (h.has("Variant Price") || h.has("Option1 Name"));
}
