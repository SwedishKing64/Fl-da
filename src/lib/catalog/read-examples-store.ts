/**
 * A supplier's settled lines, gathered from its finished batches. See read-examples.ts.
 */

import { parseJson, prisma } from "./db";
import { answerOptions, printedLine, type ReadExample } from "./read-examples";

const FINISHED = ["EXPORTED", "PUSHED"];

/** How a batch's supplier's lines were read before, newest batches first. Empty for a new supplier. */
export async function supplierHistory(batchId: string): Promise<{ examples: ReadExample[]; layouts: string[] }> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { supplierId: true } });
  if (!batch?.supplierId) return { examples: [], layouts: [] };
  const batches = await prisma.importBatch.findMany({
    where: { supplierId: batch.supplierId, id: { not: batchId } },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, status: true },
  });
  if (batches.length === 0) return { examples: [], layouts: [] };
  // A finished batch was settled as a whole. One still in review counts only where a person has
  // already corrected or confirmed the line: fixed once is a lesson from that moment, not from export.
  const settled = await settledLines(batches.filter((b) => !FINISHED.includes(b.status)).map((b) => b.id));
  const finished = new Set(batches.filter((b) => FINISHED.includes(b.status)).map((b) => b.id));
  const files = await prisma.sourceFile.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, detectedKind: "INVOICE", extractionStatus: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, batchId: true, layout: true, extractedText: true },
  });
  const layouts = Array.from(new Set(files.map((f) => f.layout).filter((l): l is string => Boolean(l))));
  const examples: ReadExample[] = [];
  for (const file of files) {
    if (!file.extractedText) continue;
    const lines = await prisma.extractedLineItem.findMany({
      where: { sourceFileId: file.id, variantId: { not: null } },
      take: 60,
      select: { variant: { select: { id: true, productId: true, sku: true, barcode: true, quantity: true, costPrice: true, option1Value: true, option2Value: true, option3Value: true, product: { select: { title: true, option1Name: true, option2Name: true, option3Name: true } } } } },
    });
    for (const { variant: v } of lines) {
      if (!v) continue;
      if (!finished.has(file.batchId) && !settled.variants.has(v.id) && !settled.products.has(v.productId)) continue;
      const read = {
        code: v.sku,
        name: v.product.title,
        quantity: v.quantity,
        cost: v.costPrice,
        ...answerOptions([v.product.option1Name, v.product.option2Name, v.product.option3Name], [v.option1Value, v.option2Value, v.option3Value]),
      };
      const printed = printedLine(file.extractedText, read, v.barcode);
      if (printed) examples.push({ printed, read, layout: file.layout });
    }
  }
  return { examples, layouts };
}

/** The lines of unfinished batches a person has corrected or confirmed, by variant and by product. */
async function settledLines(batchIds: string[]): Promise<{ variants: Set<string>; products: Set<string> }> {
  const variants = new Set<string>();
  const products = new Set<string>();
  if (batchIds.length === 0) return { variants, products };
  const logs = await prisma.auditLog.findMany({ where: { batchId: { in: batchIds }, action: { in: ["product.edited", "product.checked", "variant.edited"] } }, select: { details: true } });
  for (const log of logs) {
    const d = parseJson<{ productId?: string; variantId?: string }>(log.details, {});
    if (d.variantId) variants.add(d.variantId);
    if (d.productId) products.add(d.productId);
  }
  return { variants, products };
}
