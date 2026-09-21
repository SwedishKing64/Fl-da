import { PageHeader } from "@/app/(catalog)/ui";
import { planningAvailable } from "@/lib/catalog/adjust-plan";
import { BulkPanel } from "./BulkPanel";

export default function BulkPage() {
  return (
    <>
      <PageHeader
        title="Bulk uploads"
        subtitle="Change products already in the shop — prices through the season, moves into clearance. Export them from Shopify, say what to change, check every cell that moves, and import the file back."
      />
      <BulkPanel aiEnabled={planningAvailable()} />
    </>
  );
}
