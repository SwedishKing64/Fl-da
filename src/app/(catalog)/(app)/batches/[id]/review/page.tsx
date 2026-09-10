import { notFound } from "next/navigation";
import { prisma } from "@/lib/catalog/db";
import { loadReview } from "@/lib/catalog/pipeline";
import { Alert, Badge, LinkButton, PageHeader, statusTone } from "@/app/(catalog)/ui";
import { Steps } from "../Steps";
import { ReviewGrid } from "./ReviewGrid";

export default async function ReviewPage(props: PageProps<"/batches/[id]/review">) {
  const { id } = await props.params;
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) notFound();
  const review = await loadReview(id);
  return (
    <>
      <PageHeader
        title={<>{batch.name} <Badge tone={statusTone(batch.status)} className="align-middle">{batch.status.replace("_", " ")}</Badge></>}
        subtitle={`Step 3 of 4 — check every product and price. ${review.batch.currency !== "AUD" ? `Costs in ${review.batch.currency} × ${review.batch.fxRateToAud} → AUD.` : ""} Costs are ${review.batch.gstTreatment === "INCLUSIVE" ? "GST-inclusive" : review.batch.gstTreatment === "NONE" ? "GST-free" : "ex-GST"}; retail prices include ${Math.round(review.settings.gstRate * 100)}% GST.`}
        actions={<LinkButton href={`/batches/${id}`}>Batch settings</LinkButton>}
      />
      <Steps batchId={id} current="review" status={batch.status} />
      {review.products.length === 0 ? <Alert tone="warning">No products yet — apply a column mapping first.</Alert> : <ReviewGrid initial={review} batchId={id} />}
    </>
  );
}
