"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportBatchAction, pushBatchAction, reconcileAction, rollbackAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, fmtDate } from "@/app/(catalog)/ui";

interface ExportFileRow { id: string; filename: string; rowCount: number; sizeBytes: number; partIndex: number; partCount: number; createdAt: string }

export function ExportPanel(props: { batchId: string; status: string; errors: string[]; warnings: string[]; productCount: number; publishOnExport: boolean; shopifyConfigured: boolean; reconciled: number; counts: { new: number; variantAdd: number; update: number }; isAdmin: boolean; files: ExportFileRow[] }) {
  const { batchId, errors, warnings } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [override, setOverride] = useState(false);
  const [confirmPush, setConfirmPush] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger" | "warning" | "info"; text: string; list?: string[] } | null>(null);
  const blocked = errors.length > 0 || props.productCount === 0;
  const needsOverride = warnings.length > 0 && !override;

  const doExport = () =>
    start(async () => {
      const r = await exportBatchAction(batchId, override);
      if (r.ok) setResult({ tone: "success", text: `Generated ${r.files.length} CSV file${r.files.length === 1 ? "" : "s"}. Upload each in Shopify admin → Products → Import.` });
      else setResult({ tone: "danger", text: r.errors.length ? "Export blocked:" : "Warnings need an explicit override before export:", list: r.errors.length ? r.errors : r.warnings });
      router.refresh();
    });

  const doPush = () =>
    start(async () => {
      const r = await pushBatchAction(batchId, { confirm: confirmPush, overrideWarnings: override });
      setResult(r.ok ? { tone: "success", text: `Pushed to Shopify: ${r.created} created, ${r.updated} updated.` } : { tone: "danger", text: "Push had problems:", list: r.errors });
      setConfirmPush(false);
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <Card title="Export gate">
        {props.productCount === 0 && <Alert tone="warning">Nothing to export yet.</Alert>}
        {errors.length > 0 ? (
          <Alert tone="danger">
            <div className="font-semibold">{errors.length} blocking error{errors.length === 1 ? "" : "s"} must be fixed in the review grid before export:</div>
            <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs">{errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}{errors.length > 50 && <li>…and {errors.length - 50} more</li>}</ul>
          </Alert>
        ) : props.productCount > 0 && <Alert tone="success">No blocking errors. {props.publishOnExport ? "Products will be exported as ACTIVE." : "Products will be exported as DRAFT (safe for pre-book stock)."}</Alert>}
        {warnings.length > 0 && (
          <Alert tone="warning" className="mt-3">
            <div className="font-semibold">{warnings.length} warning{warnings.length === 1 ? "" : "s"} (missing images, low margins, etc.)</div>
            <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs">{warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}{warnings.length > 40 && <li>…and {warnings.length - 40} more</li>}</ul>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> I have reviewed these warnings and want to export anyway</label>
          </Alert>
        )}
        {result && <Alert tone={result.tone} className="mt-3"><div>{result.text}</div>{result.list && <ul className="mt-1 list-disc pl-5 text-xs">{result.list.slice(0, 30).map((l, i) => <li key={i}>{l}</li>)}</ul>}</Alert>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={pending || blocked || needsOverride} onClick={doExport}>{pending ? "Working…" : "Generate Shopify CSV"}</Button>
          {props.status === "EXPORTED" && <span className="text-xs text-[var(--ink-soft)]">Already exported — generating again replaces the files below.</span>}
        </div>
      </Card>

      {props.files.length > 0 && (
        <Card title="Generated CSV files">
          <ul className="divide-y divide-[var(--line-soft)] text-sm">
            {props.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><a href={`/api/catalog/exports/${f.id}`} className="font-medium text-[var(--violet)]">{f.filename}</a><div className="text-xs text-[var(--ink-soft)]">{f.partCount > 1 ? `Part ${f.partIndex} of ${f.partCount} · ` : ""}{f.rowCount} rows · {(f.sizeBytes / 1024).toFixed(0)} KB · {fmtDate(f.createdAt)}</div></div>
                <a href={`/api/catalog/exports/${f.id}`} className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs">Download</a>
              </li>
            ))}
          </ul>
          {props.files.some((f) => f.partCount > 1) && <p className="mt-2 text-xs text-[var(--ink-soft)]">The batch exceeded Shopify&apos;s 15MB import limit, so it was split. Import the parts in order.</p>}
        </Card>
      )}

      <Card title="Push directly to Shopify (Admin API)">
        {!props.shopifyConfigured ? (
          <p className="text-sm text-[var(--ink-soft)]">Connect a store under <a href="/shopify" className="text-[var(--violet)]">Shopify</a> to push products without a CSV.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>Reconciled against the live catalog: <strong>{props.reconciled}</strong> of {props.productCount} products — {props.counts.new} new, {props.counts.variantAdd} add variants, {props.counts.update} update existing.</p>
            {props.reconciled < props.productCount && <Alert tone="warning">Run the Shopify check first so existing products are updated instead of duplicated. <Button size="sm" className="ml-2" disabled={pending} onClick={() => start(async () => { const r = await reconcileAction(batchId); setResult(r.ok ? { tone: "info", text: `Shopify check: ${r.data!.new} new, ${r.data!.variantAdd} add variants, ${r.data!.update} update.` } : { tone: "danger", text: r.error }); router.refresh(); })}>Check now</Button></Alert>}
            {(props.counts.update > 0 || props.counts.variantAdd > 0) && <Alert tone="warning">{props.counts.update + props.counts.variantAdd} products already exist in Shopify. Pushing replaces their variants, prices and details with what is in this batch.</Alert>}
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={confirmPush} onChange={(e) => setConfirmPush(e.target.checked)} disabled={blocked || needsOverride} /> I understand this writes to the live store</label>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={pending || blocked || needsOverride || !confirmPush || props.status === "PUSHED"} onClick={doPush}>{pending ? "Pushing…" : "Push to Shopify"}</Button>
              {props.status === "PUSHED" && props.isAdmin && <Button disabled={pending} onClick={() => { if (confirm("Roll back this push? Products it created are deleted and prices it changed are restored.")) start(async () => { const r = await rollbackAction(batchId); setResult(r.ok ? { tone: r.data!.errors.length ? "warning" : "success", text: `Rolled back: ${r.data!.deleted} products deleted, ${r.data!.restored} variants restored.`, list: r.data!.errors } : { tone: "danger", text: r.error }); router.refresh(); }); }}>Roll back push</Button>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
