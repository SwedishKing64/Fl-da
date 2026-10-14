import { requireUser } from "@/lib/catalog/auth";
import { aiAvailable } from "@/lib/catalog/extract/ai";
import { PageHeader } from "@/app/(catalog)/ui";
import { BillsPanel } from "./BillsPanel";
import { getSupplierList } from "@/lib/catalog/bills/supplier-list";

/** Reading an invoice is one long request; it takes the page's limit. */
export const maxDuration = 300;

export default async function BillsPage() {
  await requireUser();
  const suppliers = await getSupplierList();
  return (
    <>
      <PageHeader
        title="Bills for QuickBooks"
        subtitle="Supplier invoices read for the books — who, when, how much, how much of it GST — checked on screen and saved as the spreadsheet QuickBooks Online imports as bills. A scanned batch of invoices is split into one bill each."
      />
      <BillsPanel aiEnabled={aiAvailable()} suppliers={suppliers} />
    </>
  );
}
