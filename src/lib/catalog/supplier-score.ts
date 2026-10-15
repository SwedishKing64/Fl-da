/**
 * The record of each supplier's paperwork, gathered from the database: products built per batch,
 * products a person touched after the build (from the audit trail), and which batches finished.
 */

import { prisma, parseJson } from "./db";
import { recordFrom, type BatchRecord, type SupplierRecord } from "./supplier-record";

const FINISHED = ["EXPORTED", "PUSHED"];
const EDITS = ["product.edited", "variant.edited"];

/** Products in a batch a person changed on the review grid after the build. */
export async function touchedInBatch(batchId: string): Promise<{ products: number; touched: number }> {
  const [products, built] = await Promise.all([
    prisma.product.count({ where: { batchId } }),
    prisma.product.findFirst({ where: { batchId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (products === 0 || !built) return { products, touched: 0 };
  const logs = await prisma.auditLog.findMany({ where: { batchId, action: { in: EDITS }, createdAt: { gt: built.createdAt } }, select: { action: true, details: true } });
  const productIds = new Set<string>();
  const variantIds = new Set<string>();
  for (const log of logs) {
    const d = parseJson<{ productId?: string; variantId?: string }>(log.details, {});
    if (d.productId) productIds.add(d.productId);
    if (d.variantId) variantIds.add(d.variantId);
  }
  if (variantIds.size > 0) {
    const owners = await prisma.variant.findMany({ where: { id: { in: [...variantIds] } }, select: { productId: true } });
    for (const o of owners) productIds.add(o.productId);
  }
  return { products, touched: Math.min(products, productIds.size) };
}

async function batchRecords(supplierId: string, except?: string): Promise<BatchRecord[]> {
  const batches = await prisma.importBatch.findMany({ where: { supplierId, ...(except ? { id: { not: except } } : {}) }, select: { id: true, status: true } });
  return Promise.all(batches.map(async (b) => ({ ...(await touchedInBatch(b.id)), finished: FINISHED.includes(b.status) })));
}

/** One supplier's record, leaving out the batch being looked at. */
export async function supplierRecordFor(supplierId: string, except?: string): Promise<SupplierRecord | null> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!supplier) return null;
  return recordFrom(supplier.id, supplier.name, await batchRecords(supplier.id, except));
}

/** Every supplier's record, the ones that need a look first. */
export async function supplierRecords(): Promise<SupplierRecord[]> {
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const records = await Promise.all(suppliers.map(async (s) => recordFrom(s.id, s.name, await batchRecords(s.id))));
  return records.sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.imports - a.imports);
}
