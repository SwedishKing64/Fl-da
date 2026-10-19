import { PageHeader } from "@/app/(catalog)/ui";
import { planningAvailable } from "@/lib/catalog/adjust-plan";
import { requireUser } from "@/lib/catalog/auth";
import { initialsFrom } from "@/lib/catalog/tagging";
import { BulkPanel } from "./BulkPanel";
import { getBindingList } from "@/lib/catalog/trades/snow/binding-store";

/**
 * Reading an instruction sheet is a vision call over a multi-page document, and Server Actions on
 * a page take the page's maxDuration. Without this they take the platform default — ten or fifteen
 * seconds — so a four-page table was cut off mid-read and came back as "could not be read".
 */
export const maxDuration = 300;

export default async function BulkPage() {
  // The marker tag names who built a product, so the page knows whose work this is.
  const user = await requireUser();
  const builtBy = initialsFrom(user.name || user.email);
  const bindings = (await getBindingList().catch(() => null))?.entries ?? [];
  return (
    <>
      <PageHeader
        title="Prices and stock"
        subtitle="Change products already in the shop: prices through the season, moves into clearance, a delivery added to stock. Export them from Shopify, say what to change in plain words, check every cell that moves, and import the file back."
      />
      <BulkPanel aiEnabled={planningAvailable()} builtBy={builtBy} bindings={bindings} />
    </>
  );
}
