import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { PageHeader } from "@/app/(catalog)/ui";
import { NewBatchForm } from "./NewBatchForm";

export default async function NewBatchPage() {
  const [suppliers, settings] = await Promise.all([prisma.supplier.findMany({ orderBy: { name: "asc" } }), getSettings()]);
  return (
    <>
      <PageHeader title="New import batch" subtitle="Step 1 of 4 — tell us about the invoice, then upload the files." />
      <NewBatchForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, defaultCurrency: s.defaultCurrency, defaultGstTreatment: s.defaultGstTreatment }))} fxRates={settings.fxRates} />
    </>
  );
}
