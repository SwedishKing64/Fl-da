/**
 * Which products the shop already sells a built product could be.
 *
 * A line is placed by its barcode first, then its SKU, then its handle. When those point at more
 * than one product, nothing picks one: with two candidates there is no way to tell which is
 * meant, and a guess puts this batch's prices and sizes on a listing nobody checked. The batch
 * says what it could be, and a person says which, or that it is new.
 */

export interface CatalogueRow {
  /** The product's identity in the shop: a Shopify product id, or `listing:<handle>` from the shop's export. */
  id: string;
  handle: string;
  title: string;
  sku: string;
  barcode: string;
}

export interface MatchCandidate {
  id: string;
  handle: string;
  title: string;
  /** How it matched: "handle", "SKU AB-1", "barcode 9312…". */
  on: string[];
}

const code = (s: string) => s.trim().replace(/^'/, "").toLowerCase();

export function candidatesFor(product: { handle: string; variants: Array<{ sku: string; barcode: string }> }, rows: CatalogueRow[]): MatchCandidate[] {
  const handle = product.handle.trim().toLowerCase();
  const skus = new Set(product.variants.map((v) => code(v.sku)).filter(Boolean));
  const barcodes = new Set(product.variants.map((v) => code(v.barcode)).filter(Boolean));
  const found = new Map<string, MatchCandidate>();
  const add = (row: CatalogueRow, how: string) => {
    const c = found.get(row.id) ?? { id: row.id, handle: row.handle, title: row.title, on: [] };
    if (!c.on.includes(how)) c.on.push(how);
    found.set(row.id, c);
  };
  for (const row of rows) {
    const b = code(row.barcode);
    if (b && barcodes.has(b)) add(row, `barcode ${row.barcode.trim()}`);
    const k = code(row.sku);
    if (k && skus.has(k)) add(row, `SKU ${row.sku.trim()}`);
    if (handle && row.handle.trim().toLowerCase() === handle) add(row, "handle");
  }
  const weight = (c: MatchCandidate) => c.on.filter((o) => o.startsWith("barcode")).length * 100 + c.on.filter((o) => o.startsWith("SKU")).length * 10 + (c.on.includes("handle") ? 1 : 0);
  return Array.from(found.values()).sort((a, b) => weight(b) - weight(a) || a.handle.localeCompare(b.handle));
}

/** One sentence for the review grid when a product fits more than one. */
export function describeCandidates(candidates: MatchCandidate[]): string {
  const list = candidates.slice(0, 4).map((c) => `${c.handle} (${c.on.join(", ")})`).join("; ");
  return `Fits ${candidates.length} products the shop already sells: ${list}${candidates.length > 4 ? "; …" : ""} — say which, or that it is new`;
}
