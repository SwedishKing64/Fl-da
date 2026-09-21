import { PageHeader } from "@/app/(catalog)/ui";
import { planningAvailable } from "@/lib/catalog/adjust-plan";
import { AdjustPanel } from "./AdjustPanel";

export default function AdjustPage() {
  return (
    <>
      <PageHeader
        title="Price &amp; clearance"
        subtitle="Change products that are already in the shop. Export them from Shopify, say what to change, check the list, and import the file back."
      />
      <AdjustPanel aiEnabled={planningAvailable()} />
    </>
  );
}
