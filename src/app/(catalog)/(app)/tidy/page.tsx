import { requireUser } from "@/lib/catalog/auth";
import { aiAvailable } from "@/lib/catalog/anthropic";
import { PageHeader } from "@/app/(catalog)/ui";
import { TidyPanel } from "./TidyPanel";

/** Reading a page of paperwork is one long request; it takes the page's limit. */
export const maxDuration = 300;

export default async function TidyPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Tidy a document"
        subtitle="A photo of an order confirmation or invoice, pen and all, read into a table you can check and download as a CSV. The CSV goes into Bulk uploads as the invoice."
      />
      <TidyPanel aiEnabled={aiAvailable()} />
    </>
  );
}
