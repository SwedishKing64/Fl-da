import { notFound } from "next/navigation";
import { prisma } from "@/lib/catalog/db";
import { loadReview } from "@/lib/catalog/pipeline";
import { isPlaceholderBody } from "@/lib/catalog/extract/lookup";
import { Alert, Badge, LinkButton, PageHeader, statusTone } from "@/app/(catalog)/ui";
import { Steps } from "../Steps";
import { ReviewGrid } from "./ReviewGrid";
import { LinksPanel } from "./LinksPanel";
import { LookupPanel } from "./LookupPanel";
import { lookupEnabled } from "@/lib/catalog/enrich";

/**
 * Server Actions on a page take the page's maxDuration, so this is what the web lookup runs under.
 * Without it they take the platform default, and a lookup pass was killed before it could reply.
 */
export const maxDuration = 300;

export default async function ReviewPage(props: PageProps<"/batches/[id]/review">) {
  const { id } = await props.params;
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) notFound();
  const review = await loadReview(id);
  // What the web lookup still has to answer for: a product with no real description, no brand, or
  // no recommended retail on any variant. The panel starts itself when this is not zero.
  const outstanding = review.products.filter(
    (p) => isPlaceholderBody(p.bodyHtml) || !p.vendor.trim() || p.variants.every((v) => !(v.retailPrice > 0)),
  ).length;
  // What the lookup has done so far, per product. Without this on screen, "there are still no
  // descriptions" cannot be told apart from "it was never run", "it ran and was killed" and "it
  // ran and the web had nothing" — three different bugs that look identical from the outside.
  const states = review.products.reduce<Record<string, number>>((acc, p) => {
    acc[p.lookupStatus] = (acc[p.lookupStatus] ?? 0) + 1;
    return acc;
  }, {});
  // A product written under a handle the shop already lists is a quantity update of a listing that
  // has its page already; only the new products are asked for one.
  const inShop = new Set((await prisma.shopListing.findMany({ where: { handle: { in: review.products.map((p) => p.handle) } }, select: { handle: true } })).map((l) => l.handle));
  return (
    <>
      <PageHeader
        title={<>{batch.name} <Badge tone={statusTone(batch.status)} className="align-middle">{batch.status.replace("_", " ")}</Badge></>}
        subtitle={`Check every product and price. ${review.batch.currency !== "AUD" ? `Costs in ${review.batch.currency} × ${review.batch.fxRateToAud} → AUD.` : ""} Costs are ${review.batch.gstTreatment === "INCLUSIVE" ? "GST-inclusive" : review.batch.gstTreatment === "NONE" ? "GST-free" : "ex-GST"}; retail prices include ${Math.round(review.settings.gstRate * 100)}% GST.`}
        actions={<LinkButton href={`/batches/${id}`}>Batch settings</LinkButton>}
      />
      <Steps batchId={id} current="review" status={batch.status} />
      {review.products.length === 0 ? (
        <Alert tone="warning">No products yet — upload a supplier file first.</Alert>
      ) : (
        <>
          <LinksPanel
            batchId={id}
            locked={["EXPORTED", "PUSHED"].includes(batch.status)}
            products={review.products.map((p) => ({ id: p.id, title: p.title, handle: p.handle, url: ["LINKED", "RELINKED", "LINK_FAILED", "PAGE", "PAGE_UNSURE"].includes(p.lookupStatus) ? p.lookupSource : "", status: p.lookupStatus, inShop: inShop.has(p.handle) }))}
          />
          <LookupPanel batchId={id} outstanding={outstanding} enabled={lookupEnabled()} states={states} />
          <ReviewGrid initial={review} batchId={id} />
        </>
      )}
    </>
  );
}
