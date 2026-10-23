import { prisma } from "@/lib/catalog/db";
import { Alert } from "@/app/(catalog)/ui";

/**
 * While a shop is on its very first batch, the batch pages say what the tutorial promised: that
 * what is fixed here is kept. Gone from the second batch on.
 */
export async function FirstInvoiceNote({ stage }: { stage: "upload" | "review" }) {
  const batches = await prisma.importBatch.count().catch(() => 2);
  if (batches !== 1) return null;
  return (
    <Alert tone="info" className="mb-4">
      <div className="font-semibold">Your first invoice, together</div>
      <div className="text-[13.5px]">
        {stage === "upload"
          ? "Drop in the supplier's invoice or order form, then build. Flöda reads every line and shows you what it made of each."
          : "Check each product: its name, sizes and colours, price and product type. Every fix you make is kept: rename an option or change a product type, and the next invoice from this supplier is built that way on its own."}
      </div>
    </Alert>
  );
}
