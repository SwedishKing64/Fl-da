"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { downloadCsvAction, exportBatchAction, pushBatchAction, reconcileAction, rollbackAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, fmtDate } from "@/app/(catalog)/ui";
import { csvFilename } from "@/lib/catalog/csv";

interface ExportFileRow { id: string; filename: string; rowCount: number; sizeBytes: number; partIndex: number; partCount: number; createdAt: string }

export function ExportPanel(props: { batchId: string; status: string; errors: string[]; warnings: string[]; productCount: number; shopifyConfigured: boolean; reconciled: number; counts: { new: number; variantAdd: number; update: number }; isAdmin: boolean; files: ExportFileRow[] }) {
  const { batchId, errors, warnings } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  // The download gets its own flag. Sharing one `pending` meant any other transition on the page
  // — a reconcile, a refresh that was slow to come back — greyed the Download button out and
  // left it reading "Saving…", which is indistinguishable from a download that does nothing.
  const [downloading, setDownloading] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [confirmPush, setConfirmPush] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger" | "warning" | "info"; text: string; list?: string[] } | null>(null);
  // Nothing about the products blocks the CSV any more — what Shopify would reject is repaired on
  // the way out (see repair.ts). Only having nothing to export stops the button.
  const blocked = props.productCount === 0;
  // Warnings do not gate the CSV. They still gate the push, which writes to the live store.
  const pushNeedsOverride = warnings.length > 0 && !override;

  /**
   * Save the CSV from the page rather than by following a link.
   *
   * A link to the file route downloads nothing visible when it fails, and says nothing about why.
   * This asks the server for the text, writes it to a file the browser saves, and puts any failure
   * on screen where it can be read.
   */
  const doDownload = async (fileId: string, filename: string) => {
    setDownloading(fileId);
    try {
      const r = await downloadCsvAction(fileId);
      if (!r.ok) {
        setResult({ tone: "danger", text: `Could not download ${filename}.`, list: [r.error, `If this keeps happening, use Open next to the file — it fetches the same CSV a different way.`] });
        return;
      }
      const url = URL.createObjectURL(new Blob([r.data!.text], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = csvFilename(r.data!.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next tick: Safari needs the URL to outlive the click.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setResult({ tone: "success", text: `Saved ${r.data!.filename}. Import it in Shopify admin → Products → Import.` });
    } catch (err) {
      // A server action that throws used to reject the promise and stop here with nothing on
      // screen, which is the "clicking Download does nothing" everyone describes.
      setResult({ tone: "danger", text: `Could not download ${filename}.`, list: [err instanceof Error ? err.message : String(err), `Use Open next to the file — it fetches the same CSV a different way.`] });
    } finally {
      setDownloading(null);
    }
  };

  const doExport = () =>
    start(async () => {
      const r = await exportBatchAction(batchId);
      if (r.ok) {
        setResult({
          tone: "success",
          text: `Generated ${r.files.length} CSV file${r.files.length === 1 ? "" : "s"}. Upload each in Shopify admin → Products → Import.${r.repairs.length ? ` ${r.repairs.length} thing${r.repairs.length === 1 ? " was" : "s were"} repaired on the way out:` : ""}`,
          list: r.repairs.slice(0, 30).map((x) => `${x.handle}: ${x.what}`),
        });
      } else setResult({ tone: "danger", text: "Export failed:", list: r.errors });
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
        {props.productCount > 0 && <Alert tone="success">Ready to export. Products are exported as DRAFT, so each one can be checked before it goes live.</Alert>}
        {errors.length > 0 && (
          <Alert tone="info" className="mt-3">
            <div className="font-semibold">{errors.length} thing{errors.length === 1 ? "" : "s"} the export will repair for you</div>
            <p className="mt-1 text-xs">A supplier codes a colourway, not a size, so one code arrives on every size ordered. The export gives each variant its own SKU, merges rows that describe the same variant, and settles handles and options — then says exactly what it did. None of this stops the CSV.</p>
            <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs">{errors.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}{errors.length > 40 && <li>…and {errors.length - 40} more</li>}</ul>
          </Alert>
        )}
        {warnings.length > 0 && (
          <Alert tone="info" className="mt-3">
            <div className="font-semibold">{warnings.length} thing{warnings.length === 1 ? "" : "s"} to finish later — the CSV exports regardless</div>
            <p className="mt-1 text-xs">Missing prices, images and descriptions come out as empty cells. Shopify leaves an empty cell alone on import, so they can be filled in there or here.</p>
            <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs">{warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}{warnings.length > 40 && <li>…and {warnings.length - 40} more</li>}</ul>
          </Alert>
        )}
        {result && <Alert tone={result.tone} className="mt-3"><div>{result.text}</div>{result.list && <ul className="mt-1 list-disc pl-5 text-xs">{result.list.slice(0, 30).map((l, i) => <li key={i}>{l}</li>)}</ul>}</Alert>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" icon="📤" disabled={pending || blocked} onClick={doExport}>{pending ? "Working…" : "Generate Shopify CSV"}</Button>
          {props.status === "EXPORTED" && <span className="text-xs text-[var(--ink-soft)]">Already exported — generating again replaces the files below.</span>}
        </div>
      </Card>

      {props.files.length > 0 && (
        <Card title="Generated CSV files">
          <ul className="divide-y divide-[var(--line-soft)] text-sm">
            {props.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><span className="font-medium">{f.filename}</span><div className="text-xs text-[var(--ink-soft)]">{f.partCount > 1 ? `Part ${f.partIndex} of ${f.partCount} · ` : ""}{f.rowCount} rows · {(f.sizeBytes / 1024).toFixed(0)} KB · {fmtDate(f.createdAt)}</div></div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" icon="⬇️" disabled={downloading === f.id} onClick={() => doDownload(f.id, f.filename)}>{downloading === f.id ? "Saving…" : "Download"}</Button>
                  {/* The direct link stays as a second way down, for a browser that would rather
                      open the file itself than be handed one. Styled as a button, because it is
                      one — a bare bordered link next to a filled button read as decoration. */}
                  <a href={`/api/catalog/exports/${f.id}`} title="Fetch the CSV directly, if Download will not" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium underline decoration-[var(--line)] underline-offset-4 transition-all duration-200 hover:bg-neutral-50 hover:decoration-[var(--ink)]">Open</a>
                </div>
              </li>
            ))}
          </ul>
          {props.files.length > 1 && <p className="mt-2 text-xs text-[var(--ink-soft)]">One file per brand or product type (change this under Batch settings). Import each in Shopify admin → Products → Import.</p>}
        </Card>
      )}

      <Card title="Push directly to Shopify (Admin API)">
        {!props.shopifyConfigured ? (
          <p className="text-sm text-[var(--ink-soft)]">No store is connected, so products leave here as a CSV to import in Shopify admin.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>Reconciled against the live catalog: <strong>{props.reconciled}</strong> of {props.productCount} products — {props.counts.new} new, {props.counts.variantAdd} add variants, {props.counts.update} update existing.</p>
            {props.reconciled < props.productCount && <Alert tone="warning">Run the Shopify check first so existing products are updated instead of duplicated. <Button size="sm" className="ml-2" disabled={pending} onClick={() => start(async () => { const r = await reconcileAction(batchId); setResult(r.ok ? { tone: "info", text: `Shopify check: ${r.data!.new} new, ${r.data!.variantAdd} add variants, ${r.data!.update} update.` } : { tone: "danger", text: r.error }); router.refresh(); })}>Check now</Button></Alert>}
            {(props.counts.update > 0 || props.counts.variantAdd > 0) && <Alert tone="warning">{props.counts.update + props.counts.variantAdd} products already exist in Shopify. Pushing replaces their variants, prices and details with what is in this batch.</Alert>}
            {warnings.length > 0 && <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> I have reviewed the {warnings.length} warning{warnings.length === 1 ? "" : "s"} above</label>}
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={confirmPush} onChange={(e) => setConfirmPush(e.target.checked)} disabled={blocked || pushNeedsOverride} /> I understand this writes to the live store</label>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={pending || blocked || pushNeedsOverride || !confirmPush || props.status === "PUSHED"} onClick={doPush}>{pending ? "Pushing…" : "Push to Shopify"}</Button>
              {props.status === "PUSHED" && props.isAdmin && <Button disabled={pending} onClick={() => { if (confirm("Roll back this push? Products it created are deleted and prices it changed are restored.")) start(async () => { const r = await rollbackAction(batchId); setResult(r.ok ? { tone: r.data!.errors.length ? "warning" : "success", text: `Rolled back: ${r.data!.deleted} products deleted, ${r.data!.restored} variants restored.`, list: r.data!.errors } : { tone: "danger", text: r.error }); router.refresh(); }); }}>Roll back push</Button>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
