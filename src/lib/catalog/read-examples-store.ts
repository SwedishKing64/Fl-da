/**
 * A supplier's settled lines, gathered from its finished batches. See read-examples.ts.
 */

import { prisma } from "./db";
import { answerOptions, printedLine, type ReadExample } from "./read-examples";

const FINISHED = ["EXPORTED", "PUSHED"];

/** How a batch's supplier's lines were read before, newest batches first. Empty for a new supplier. */
export async function supplierHistory(batchId: string): Promise<{ examples: ReadExample[]; layouts: string[] }> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { supplierId: true } });
  if (!batch?.supplierId) return { examples: [], layouts: [] };
  const batches = await prisma.importBatch.findMany({
    where: { supplierId: batch.supplierId, id: { not: batchId }, status: { in: FINISHED } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true },
  });
  if (batches.length === 0) return { examples: [], layouts: [] };
  const files = await prisma.sourceFile.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, detectedKind: "INVOICE", extractionStatus: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, layout: true, extractedText: true },
  });
  const layouts = Array.from(new Set(files.map((f) => f.layout).filter((l): l is string => Boolean(l))));
  const examples: ReadExample[] = [];
  for (const file of files) {
    if (!file.extractedText) continue;
    const lines = await prisma.extractedLineItem.findMany({
      where: { sourceFileId: file.id, variantId: { not: null } },
      take: 60,
      select: { variant: { select: { sku: true, barcode: true, quantity: true, costPrice: true, option1Value: true, option2Value: true, option3Value: true, product: { select: { title: true, option1Name: true, option2Name: true, option3Name: true } } } } },
    });
    for (const { variant: v } of lines) {
      if (!v) continue;
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
