import { notFound } from "next/navigation";
import { productTypes, typesAreKnown } from "@/lib/catalog/taxonomy";
import { prisma } from "@/lib/catalog/db";
import { loadReview } from "@/lib/catalog/pipeline";
import { isPlaceholderBody } from "@/lib/catalog/extract/lookup";
import { Alert, Badge, LinkButton, PageHeader, statusTone } from "@/app/(catalog)/ui";
import { FirstInvoiceNote } from "../FirstInvoiceNote";
import { Steps } from "../Steps";
import { NextStep } from "../NextStep";
import { ReviewGrid } from "./ReviewGrid";
import { LinksPanel } from "./LinksPanel";
import { TotalsQuestion } from "./TotalsQuestion";
import { offTotals } from "@/lib/catalog/totals";
import { colourLinksOf, coloursOfProduct } from "@/lib/catalog/page-types";
import { parseDirectives } from "@/lib/catalog/instructions";
import { LookupPanel } from "./LookupPanel";
import { lookupEnabled } from "@/lib/catalog/enrich";
import { guarded } from "@/app/(catalog)/page-failed";
import { SupplierNote } from "./SupplierNote";
import { supplierRecordFor } from "@/lib/catalog/supplier-score";
import { getShopProfile, homeCurrency } from "@/lib/catalog/shop-profile";
import { SUPPORT_MAILTO } from "@/lib/catalog/support";

/**
 * Server Actions on a page take the page's maxDuration, so this is what the web lookup runs under.
 * Without it they take the platform default, and a lookup pass was killed before it could reply.
 */
export const maxDuration = 300;

export default async function ReviewPage(props: PageProps<"/batches/[id]/review">) {
  return guarded(() => renderReviewPage(props));
}

async function renderReviewPage(props: PageProps<"/batches/[id]/review">) {
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
  // Unless every product here is new, which the person has said: then a handle that happens to
  // match is not a listing, and each product is asked for its page.
  // How this supplier's paperwork has read before, or that nobody has checked it before.
  const record = batch.supplierId ? await supplierRecordFor(batch.supplierId, batch.id) : null;
  // On the shop's first two batches a person is named, not a feedback box: the moment a new
  // customer is stuck is the moment the engineer who set them up should be one click away.
  const finished = await prisma.importBatch.count({ where: { status: { in: ["EXPORTED", "PUSHED"] } } });
  // A document whose lines did not add up to its own printed totals, even after a second read.
  const offFiles = (await prisma.sourceFile.findMany({ where: { batchId: id, extractionError: { contains: "Does not add up:" } }, select: { id: true, filename: true, extractionError: true } }))
    .map((f) => ({ id: f.id, filename: f.filename, said: offTotals(f.extractionError) ?? "" }))
    .filter((f) => f.said);
  const profile = await getShopProfile();
  const askHref = `${SUPPORT_MAILTO}?subject=${encodeURIComponent(`${profile.name || "A shop"} · batch "${batch.name}"`)}&body=${encodeURIComponent(`Hello,\n\nI'm looking at the batch "${batch.name}"${batch.supplierId ? ` from ${record?.name ?? "a supplier"}` : ""} and\n\n(say what looks wrong, or what you are unsure about)\n\n`)}`;
  const inShop = parseDirectives(batch.directives).allNew
    ? new Set<string>()
    : new Set((await prisma.shopListing.findMany({ where: { handle: { in: review.products.map((p) => p.handle) } }, select: { handle: true } })).map((l) => l.handle));
  const categories = (await prisma.categoryRule.findMany({ select: { category: true }, distinct: ["category"] }).catch(() => [])).map((r) => r.category);
  return (
    <>
      <PageHeader
        title={<>{batch.name} <Badge tone={statusTone(batch.status)} className="align-middle">{batch.status.replace("_", " ")}</Badge></>}
        subtitle={`Check every product and price. ${review.batch.currency !== homeCurrency() ? `Costs in ${review.batch.currency} × ${review.batch.fxRateToHome} → ${homeCurrency()}.` : ""} Costs are ${review.batch.gstTreatment === "INCLUSIVE" ? "GST-inclusive" : review.batch.gstTreatment === "NONE" ? "GST-free" : "ex-GST"}; retail prices include ${Math.round(review.settings.gstRate * 100)}% GST.`}
        actions={<LinkButton href={`/batches/${id}`}>Batch settings</LinkButton>}
      />
      <Steps batchId={id} current="review" status={batch.status} />
      <FirstInvoiceNote stage="review" />
      <NextStep href={`/batches/${id}/export`} label="Next: Export" disabledWhy={review.products.length === 0 ? "Nothing to export yet; upload a supplier file first." : undefined} />
      {review.products.length === 0 ? (
        <Alert tone="warning">No products yet — upload a supplier file first.</Alert>
      ) : (
        <>
          {finished < 2 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--line)] bg-white px-4 py-2.5 text-[13.5px]">
              <span className="font-semibold">Your first batches.</span>
              <span className="text-[var(--ink-2)]">A Flöda engineer set you up and is on the end of this: anything that reads wrong, write and it is looked at the same working day.</span>
              <a href={askHref} className="ml-auto font-semibold text-[var(--meta)] underline">Ask a Flöda engineer about this batch →</a>
            </div>
          )}
          {offFiles.length > 0 && (
            <Alert tone="warning" className="mb-4">
              <div className="font-semibold">{offFiles.length === 1 ? "A document does not add up to its own totals" : `${offFiles.length} documents do not add up to their own totals`}</div>
              <div className="text-[13px]">Check its lines against the document. Read it again, or say the lines are right; until then the export lists it, and a push to Shopify asks first.</div>
              <ul className="mt-1 divide-y divide-[var(--line-soft)] text-[13px]">{offFiles.map((f) => <TotalsQuestion key={f.id} batchId={id} fileId={f.id} filename={f.filename} said={f.said} />)}</ul>
            </Alert>
          )}
          {record && <SupplierNote record={record} />}
          <LinksPanel
            batchId={id}
            locked={["EXPORTED", "PUSHED"].includes(batch.status)}
            products={review.products.map((p) => ({ id: p.id, title: p.title, handle: p.handle, url: ["LINKED", "RELINKED", "LINK_FAILED", "PAGE", "PAGE_UNSURE"].includes(p.lookupStatus) ? p.lookupSource : "", status: p.lookupStatus, inShop: inShop.has(p.handle), colours: coloursOfProduct(p), colourLinks: colourLinksOf(p.colourLinks) }))}
          />
          <LookupPanel batchId={id} outstanding={outstanding} enabled={lookupEnabled()} states={states} />
          <ReviewGrid initial={review} batchId={id} kinds={typesAreKnown() ? productTypes() : []} categories={categories} />
        </>
      )}
    </>
  );
}
