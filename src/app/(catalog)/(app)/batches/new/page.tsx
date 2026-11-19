import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { PageHeader } from "@/app/(catalog)/ui";
import { NewBatchForm } from "./NewBatchForm";
import { homeCurrency } from "@/lib/catalog/shop-profile";

export default async function NewBatchPage() {
  const [suppliers, settings] = await Promise.all([prisma.supplier.findMany({ orderBy: { name: "asc" } }), getSettings()]);
  return (
    <>
      <PageHeader title="New import batch" subtitle="Tell us about the invoice, then upload the files." />
      <NewBatchForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, defaultCurrency: s.defaultCurrency, defaultGstTreatment: s.defaultGstTreatment }))} fxRates={settings.fxRates} home={homeCurrency()} />
    </>
  );
}
