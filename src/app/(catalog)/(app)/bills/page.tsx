import { requireUser } from "@/lib/catalog/auth";
import { aiAvailable } from "@/lib/catalog/extract/ai";
import { PageHeader } from "@/app/(catalog)/ui";
import { BillsPanel } from "./BillsPanel";

/** Reading an invoice is one long request; it takes the page's limit. */
export const maxDuration = 300;

export default async function BillsPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Bills for QuickBooks"
        subtitle="Supplier invoices read for the books — who, when, how much, how much of it GST — checked on screen and saved as one CSV that QuickBooks Online imports as bills."
      />
      <BillsPanel aiEnabled={aiAvailable()} />
    </>
  );
}
