import { aiAvailable } from "@/lib/catalog/anthropic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/catalog/db";
import { loadReview } from "@/lib/catalog/pipeline";
import { blockingErrors, hardErrors, warningList } from "@/lib/catalog/validate";
import { offTotals } from "@/lib/catalog/totals";
import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { Badge, Card, LinkButton, PageHeader, cx, fmtDate, money, pct, statusTone } from "@/app/(catalog)/ui";
import { Steps } from "../Steps";
import { NextStep } from "../NextStep";
import { ExportPanel } from "./ExportPanel";
import { FeedbackChat } from "./FeedbackChat";

export default async function ExportPage(props: PageProps<"/batches/[id]/export">) {
  const { id } = await props.params;
  const user = await requireUser();
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { exports: { orderBy: { partIndex: "asc" } }, feedback: { orderBy: { createdAt: "asc" } }, auditLogs: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } } } });
  if (!batch) notFound();
  const [review, settings] = await Promise.all([loadReview(id), getSettings()]);
  // A document whose lines did not add up, not yet settled on the review page, is the first thing to check.
  const offFiles = await prisma.sourceFile.findMany({ where: { batchId: id, extractionError: { contains: "Does not add up:" } }, select: { filename: true, extractionError: true } });
  const hard = [
    ...offFiles.filter((f) => offTotals(f.extractionError)).map((f) => `${f.filename}: its lines do not add up to its own totals — read it again or settle it on the review page`),
    ...hardErrors(review.products),
  ];
  // The repairable ones, listed as what the export will do; the hard ones as what to check before importing.
  const errors = blockingErrors(review.products).filter((e) => !hard.includes(e));
  const warnings = warningList(review.products);
  const s = review.summary;
  const reconciled = review.products.filter((p) => p.reconcileStatus !== "UNKNOWN").length;

  return (
    <>
      <PageHeader title={<>{batch.name} <Badge tone={statusTone(batch.status)} className="align-middle">{batch.status.replace("_", " ")}</Badge></>} subtitle="Generate the Shopify CSV, or push straight to the store." actions={<LinkButton href={`/batches/${id}/review`}>← Back to review</LinkButton>} />
      <Steps batchId={id} current="export" status={batch.status} />
      <NextStep href="/batches/new" label="Next: Start the next batch" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ExportPanel
            batchId={id}
            status={batch.status}
            hard={hard}
            errors={errors}
            warnings={warnings}
            productCount={review.products.length}
            shopifyConfigured={Boolean(settings.shopify.storeDomain && settings.shopify.accessToken)}
            reconciled={reconciled}
            counts={{ new: review.products.filter((p) => p.reconcileStatus === "NEW").length, variantAdd: review.products.filter((p) => p.reconcileStatus === "VARIANT_ADD").length, update: review.products.filter((p) => p.reconcileStatus === "UPDATE").length, ambiguous: review.products.filter((p) => p.reconcileStatus === "AMBIGUOUS").length }}
            isAdmin={user.role === "ADMIN"}
            files={batch.exports.map((f) => ({ id: f.id, filename: f.filename, rowCount: f.rowCount, sizeBytes: f.sizeBytes, partIndex: f.partIndex, partCount: f.partCount, createdAt: f.createdAt.toISOString() }))}
          />
          <FeedbackChat
            batchId={id}
            aiEnabled={aiAvailable()}
            initial={batch.feedback.map((f) => ({ id: f.id, role: f.role, body: f.body, proposal: f.proposal, appliedRule: f.appliedRule, createdAt: f.createdAt.toISOString() }))}
          />
          <Card title="Activity on this batch">
            <ul className="divide-y divide-[var(--line-soft)] text-sm">
              {batch.auditLogs.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-mono text-xs text-[var(--ink-soft)]">{a.action}</span> {a.user?.name && <span className="text-xs">by {a.user.name}</span>}</span><span className="text-xs text-[var(--ink-soft)]">{fmtDate(a.createdAt)}</span></li>
              ))}
            </ul>
          </Card>
        </div>
        <Card title="Batch profit summary">
          <dl className="space-y-2 text-sm">
            <Row k="Products / variants / units" v={`${s.products} / ${s.variants} / ${s.units}`} />
            <Row k="Total goods value (retail inc GST)" v={money(s.totalRetailIncGst)} />
            <Row k="GST collected" v={money(s.totalGst)} />
            <Row k="Ex-GST revenue" v={money(s.totalExGstRevenue)} />
            <Row k="Total landed cost" v={money(s.totalLandedCost)} />
            <Row k="Net profit = Σ ex-GST revenue − Σ landed cost" v={money(s.totalNetProfit)} strong />
            <Row k="Average margin" v={pct(s.averageMarginPct)} />
            <Row k="Rows below minimum margin" v={String(s.lowMarginVariants)} />
            <Row k="Exported as" v="Drafts" />
          </dl>
        </Card>
      </div>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="text-[var(--ink-soft)]">{k}</dt><dd className={cx("m-0 shrink-0 text-right", strong ? "text-base font-semibold" : "font-medium tabular-nums")}>{v}</dd></div>;
}
