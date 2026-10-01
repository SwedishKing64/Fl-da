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
import { BatchSettingsForm } from "./BatchSettingsForm";
import { BuildProductsButton, DeleteFileButton, DeleteBatchButton, RetryExtractionButton } from "./BatchButtons";
import { ExtractedRows } from "./ExtractedRows";

export default async function BatchPage(props: PageProps<"/batches/[id]">) {
  const { id } = await props.params;
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { supplier: true, files: { orderBy: { createdAt: "asc" } }, instructions: { orderBy: { createdAt: "asc" } }, _count: { select: { products: true } } } });
  if (!batch) notFound();
  const [suppliers, settings, reviewed] = await Promise.all([prisma.supplier.findMany({ orderBy: { name: "asc" } }), getSettings(), reviewedSinceBuilt(id)]);
  const locked = ["EXPORTED", "PUSHED"].includes(batch.status);
  const extracted = batch.files.filter((f) => f.extractionStatus === "DONE");

  return (
    <>
      <PageHeader
        title={batch.name}
        subtitle={<>{batch.supplier?.name ?? "No supplier"} · <Badge tone={statusTone(batch.status)}>{batch.status.replace("_", " ")}</Badge></>}
        actions={<>
          {batch._count.products > 0 && <LinkButton href={`/batches/${id}/review`} variant="primary">Review &amp; price →</LinkButton>}
          {batch._count.products === 0 && extracted.length > 0 && !locked && <BuildProductsButton batchId={id} />}
          {extracted.length > 0 && <LinkButton href={`/batches/${id}/map`}>Column mapping</LinkButton>}
          <DeleteBatchButton batchId={id} disabled={batch.status === "PUSHED"} />
        </>}
      />
      <Steps batchId={id} current="upload" status={batch.status} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {batch._count.products > 0 && <BuildCheck batchId={id} needed={!reviewed} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)} locked={locked} />}
          <InstructionChat
            batchId={id}
            locked={locked}
            aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)}
            directives={describeDirectives(parseDirectives(batch.directives))}
            initial={batch.instructions.map((m) => ({ id: m.id, role: m.role, body: m.body, createdAt: m.createdAt.toISOString() }))}
          />
          <Card title="Supplier files">
            {locked ? <Empty>This batch has been exported; files are locked for audit.</Empty> : <UploadPanel batchId={id} aiEnabled={settings ? Boolean(process.env.ANTHROPIC_API_KEY) : false} hasProducts={batch._count.products > 0} productCount={batch._count.products} reading={batch.files.filter((f) => f.extractionStatus === "PENDING").length} />}
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
                          <Badge tone={f.extractionStatus === "DONE" ? "success" : f.extractionStatus === "FAILED" ? "danger" : "warning"}>{f.extractionStatus === "PENDING" ? "reading…" : f.extractionMethod ?? f.extractionStatus}</Badge>
                          {f.extractionError && <div className="mt-1 max-w-md whitespace-normal text-xs text-amber-800">{f.extractionError}</div>}
                        </td>
                        <td className="text-right">{rows}</td>
                        <td className="text-right"><div className="flex items-center justify-end gap-2">{f.extractionStatus === "FAILED" && !locked && <RetryExtractionButton fileId={f.id} />}{!locked && <DeleteFileButton fileId={f.id} />}</div></td>
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
