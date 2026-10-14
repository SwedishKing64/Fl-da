import { aiAvailable } from "@/lib/catalog/anthropic";
import { notFound } from "next/navigation";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Details, Empty, LinkButton, PageHeader, fmtDate, statusTone } from "@/app/(catalog)/ui";
import { getSettings } from "@/lib/catalog/settings";
import { describeDirectives, parseDirectives } from "@/lib/catalog/instructions";
import { Steps } from "./Steps";
import { UploadPanel } from "./UploadPanel";
import { InstructionChat } from "./InstructionChat";
import { BuildCheck } from "./BuildCheck";
import { reviewedSinceBuilt } from "@/lib/catalog/batch-agent";
import { ranOutOfTime } from "@/lib/catalog/extract/ai";
import { BatchSettingsForm } from "./BatchSettingsForm";
import { BuildProductsButton, DeleteFileButton, DeleteBatchButton, RetryExtractionButton } from "./BatchButtons";
import { ExtractedRows } from "./ExtractedRows";
import { LinksPanel } from "./review/LinksPanel";
import { BuildList } from "./BuildList";
import { TypeList } from "./TypeList";
import { guarded } from "@/app/(catalog)/page-failed";

/**
 * The build check, the chat's rebuilds and the page reads are each a long model call, and a
 * Server Action called from a page takes the page's maxDuration. Without this it takes the
 * platform default — ten or fifteen seconds — and is cut off mid-way. See bulk/page.tsx.
 */
export const maxDuration = 300;

/**
 * A read still marked as running long after it could be. Reading happens after the upload has
 * answered, with five minutes to run; a file still "reading…" well past that is one the host cut off,
 * and nothing else ever says so. The stamp is the read's own start, set when it began.
 */
const STALL_MS = 330_000;
const startedAt = (f: { createdAt: Date; readStartedAt: Date | null }) => (f.readStartedAt ?? f.createdAt).getTime();
const stalled = (f: { extractionStatus: string; createdAt: Date; readStartedAt: Date | null }) => f.extractionStatus === "PENDING" && Date.now() - startedAt(f) > STALL_MS;

export default async function BatchPage(props: PageProps<"/batches/[id]">) {
  return guarded(() => renderBatchPage(props));
}

async function renderBatchPage(props: PageProps<"/batches/[id]">) {
  const { id } = await props.params;
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { supplier: true, files: { orderBy: { createdAt: "asc" } }, instructions: { orderBy: { createdAt: "asc" } }, _count: { select: { products: true } } } });
  if (!batch) notFound();
  const [suppliers, settings, reviewed] = await Promise.all([prisma.supplier.findMany({ orderBy: { name: "asc" } }), getSettings(), reviewedSinceBuilt(id)]);
  const locked = ["EXPORTED", "PUSHED"].includes(batch.status);
  const extracted = batch.files.filter((f) => f.extractionStatus === "DONE");
  const directives = parseDirectives(batch.directives);
  const allNew = directives.allNew;
  // The products, for their page links: asked for here, right after the build, where the person
  // is — the review page asks too, but a step on another page was a step nobody saw.
  const products = batch._count.products > 0
    ? await prisma.product.findMany({ where: { batchId: id }, select: { id: true, title: true, handle: true, productType: true, lookupStatus: true, lookupSource: true }, orderBy: { sortOrder: "asc" } })
    : [];
  // A product the shop already lists keeps the page it has — unless every product here is new,
  // which the person has said, and a handle that happens to match is not a listing.
  const inShop = allNew || products.length === 0
    ? new Set<string>()
    : new Set((await prisma.shopListing.findMany({ where: { handle: { in: products.map((p) => p.handle) } }, select: { handle: true } })).map((l) => l.handle));

  return (
    <>
      <PageHeader
        title={batch.name}
        subtitle={<>{batch.supplier?.name ?? "No supplier"} · <Badge tone={statusTone(batch.status)}>{batch.status.replace("_", " ")}</Badge></>}
        actions={<>
          {batch._count.products > 0 && <LinkButton href={`/batches/${id}/review`} variant="primary" icon="🔍">Review &amp; price →</LinkButton>}
          {batch._count.products === 0 && extracted.length > 0 && !locked && <BuildProductsButton batchId={id} />}
          {extracted.length > 0 && <LinkButton href={`/batches/${id}/map`}>Column mapping</LinkButton>}
          <DeleteBatchButton batchId={id} disabled={batch.status === "PUSHED"} />
        </>}
      />
      <Steps batchId={id} current="upload" status={batch.status} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {batch._count.products > 0 && <BuildCheck batchId={id} needed={!reviewed} aiEnabled={aiAvailable()} locked={locked} />}
          <InstructionChat
            batchId={id}
            locked={locked}
            aiEnabled={aiAvailable()}
            directives={describeDirectives(parseDirectives(batch.directives))}
            allNew={allNew}
            initial={batch.instructions.map((m) => ({ id: m.id, role: m.role, body: m.body, createdAt: m.createdAt.toISOString() }))}
          />
          <Card title="Supplier files">
            {locked ? <Empty>This batch has been exported; files are locked for audit.</Empty> : <UploadPanel batchId={id} aiEnabled={settings ? aiAvailable() : false} hasProducts={batch._count.products > 0} productCount={batch._count.products} reading={batch.files.filter((f) => f.extractionStatus === "PENDING" && !stalled(f)).length} pendingSince={batch.files.filter((f) => f.extractionStatus === "PENDING" && !stalled(f)).map(startedAt)} allNew={allNew} buildNow={batch._count.products === 0 && !batch.files.some((f) => f.extractionStatus === "PENDING" && !stalled(f)) && batch.files.some((f) => f.extractionStatus === "DONE" && !["SPEC_SHEET", "PRODUCT_PHOTO", "SHOP_EXPORT"].includes(f.detectedKind ?? f.kind))} retryable={batch.files.filter((f) => !locked && (stalled(f) || (f.extractionStatus === "FAILED" && ranOutOfTime(f.extractionError)))).map((f) => ({ id: f.id, filename: f.filename }))} />}
            {batch.files.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">File</th><th>Kind</th><th>Extraction</th><th className="text-right">Rows</th><th /></tr></thead>
                <tbody>
                  {batch.files.map((f) => {
                    const rows = parseJson<unknown[]>(f.rawRows, []).length;
                    return (
                      <tr key={f.id} className="border-t border-[var(--line-soft)] align-top">
                        <td className="py-2"><div className="font-medium">{f.filename}</div><div className="text-xs text-[var(--ink-soft)]">{(f.sizeBytes / 1024).toFixed(0)} KB · {fmtDate(f.createdAt)}</div></td>
                        <td>{f.kind.replace("_", " ").toLowerCase()}</td>
                        <td>
                          <Badge tone={f.extractionStatus === "DONE" ? "success" : f.extractionStatus === "FAILED" || stalled(f) ? "danger" : "warning"}>{f.extractionStatus === "PENDING" ? (stalled(f) ? "ran out of time" : "reading…") : f.extractionMethod ?? f.extractionStatus}</Badge>
                          {stalled(f) && <div className="mt-1 max-w-md whitespace-normal text-xs text-amber-800">The reading was cut off before it finished. The file is stored: Read again gives it another go.</div>}
                          {f.extractionError && <div className="mt-1 max-w-md whitespace-normal text-xs text-amber-800">{f.extractionError}</div>}
                        </td>
                        <td className="text-right">{rows}</td>
                        <td className="text-right"><div className="flex items-center justify-end gap-2">{(f.extractionStatus === "FAILED" || stalled(f)) && !locked && <RetryExtractionButton fileId={f.id} />}{!locked && <DeleteFileButton fileId={f.id} />}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {batch.files.filter((f) => f.extractionStatus === "DONE").map((f) => (
              <ExtractedRows
                key={f.id}
                filename={f.filename}
                headers={parseJson<string[]>(f.headers, [])}
                rows={parseJson<Record<string, string>[]>(f.rawRows, [])}
              />
            ))}
          </Card>
          {(products.length > 0 || directives.types.length > 0) && (
            <TypeList batchId={id} locked={locked} built={products.map((p) => p.productType)} seen={directives.typesSeen} chosen={directives.types} />
          )}
          {(products.length > 0 || directives.skip.length > 0) && (
            <BuildList batchId={id} locked={locked} built={products.map((p) => ({ title: p.title, handle: p.handle }))} skipped={directives.skip} />
          )}
          {products.length > 0 && (
            <LinksPanel
              batchId={id}
              locked={locked}
              products={products.map((p) => ({ id: p.id, title: p.title, handle: p.handle, url: ["LINKED", "RELINKED", "LINK_FAILED", "PAGE", "PAGE_UNSURE"].includes(p.lookupStatus) ? p.lookupSource : "", status: p.lookupStatus, inShop: inShop.has(p.handle) }))}
            />
          )}
        </div>
        <div className="space-y-6">
          <Details summary="Currency, GST and freight" hint="Set once per batch. Only open it if this invoice is not in plain AUD.">
            <BatchSettingsForm
              batch={{ id: batch.id, supplierId: batch.supplierId, currency: batch.currency, fxRateToAud: batch.fxRateToAud, gstTreatment: batch.gstTreatment, freightTotalAud: batch.freightTotalAud, freightMode: batch.freightMode, splitExportBy: batch.splitExportBy, builtBy: batch.builtBy, notes: batch.notes ?? "" }}
              suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
              disabled={locked}
            />
          </Details>
        </div>
      </div>
    </>
  );
}
