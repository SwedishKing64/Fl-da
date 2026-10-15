"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyMappingsAction, createExampleBatchAction, exampleStateAction, readingCountAction, skipSetupStepAction, type ExampleState } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Card, INPUT } from "@/app/(catalog)/ui";
import type { Mapping } from "@/lib/catalog/mapping";

interface FieldDef { key: string; label: string; required: boolean }

interface Example {
  file: File;
  supplier: string;
  batchId?: string;
  stage: "chosen" | "uploading" | "reading" | "read" | "failed";
  error?: string;
  state?: ExampleState;
  /** The mapping as corrected on screen, per layout. */
  mappings: Record<string, Mapping>;
  saved: Record<string, boolean>;
}

/** "Burton_W27_order.pdf" → "Burton". The person can change it. */
function guessSupplier(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const first = stem.split(/[\s_\-.]+/).find((w) => w && !/^\d+$/.test(w)) ?? stem;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

const WAIT_MS = 4 * 60_000;

/**
 * One example of each supplier's paperwork, read now, so the layout is settled before the season:
 * every column is shown against what Flöda took it for, the person corrects anything in the wrong
 * place, and the corrected layout is kept for that supplier. The next invoice from them reads the
 * way this one was left.
 */
export function SuppliersStep({ fields, templates, next }: { fields: FieldDef[]; templates: number; next: string }) {
  const router = useRouter();
  const [examples, setExamples] = useState<Example[]>([]);
  const [running, setRunning] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const patch = (i: number, p: Partial<Example>) => setExamples((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const choose = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).map((file) => ({ file, supplier: guessSupplier(file.name), stage: "chosen" as const, mappings: {}, saved: {} }));
    setExamples((xs) => [...xs, ...picked]);
    if (input.current) input.current.value = "";
  };

  /** Read every chosen example, one after another: a batch each, the file in it, then the layout it came out with. */
  const readAll = async () => {
    setRunning(true);
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      if (ex.stage !== "chosen" && ex.stage !== "failed") continue;
      const supplier = ex.supplier.trim();
      if (!supplier) { patch(i, { stage: "failed", error: "Say which supplier this is from." }); continue; }
      patch(i, { stage: "uploading", error: undefined });
      try {
        const made = await createExampleBatchAction(supplier, ex.file.name);
        if (!made.ok) throw new Error(made.error);
        const batchId = made.data!.batchId;
        patch(i, { batchId });
        const form = new FormData();
        form.append("files", ex.file);
        form.append("autoMap", "0");
        const res = await fetch(`/api/catalog/batches/${batchId}/upload`, { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `The upload failed (${res.status}).`);
        patch(i, { stage: "reading" });
        const started = Date.now();
        while (Date.now() - started < WAIT_MS) {
          await new Promise((r) => setTimeout(r, 1500));
          if ((await readingCountAction(batchId)) === 0) break;
        }
        const state = await exampleStateAction(batchId);
        if (!state.ok) throw new Error(state.error);
        const mappings: Record<string, Mapping> = {};
        for (const g of state.data!.groups) mappings[g.hash] = { ...g.suggestion };
        patch(i, { stage: state.data!.failed ? "failed" : "read", error: state.data!.failed ?? undefined, state: state.data!, mappings });
      } catch (err) {
        patch(i, { stage: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    }
    setRunning(false);
  };

  const remember = (i: number, hash: string) => {
    const ex = examples[i];
    if (!ex.batchId || !ex.state) return;
    const group = ex.state.groups.find((g) => g.hash === hash);
    if (!group) return;
    start(async () => {
      const r = await applyMappingsAction(ex.batchId!, [{ hash, mapping: ex.mappings[hash], options: group.options, saveTemplate: { name: `${ex.supplier.trim()} – ${ex.file.name.split(".").pop()?.toUpperCase() ?? "file"} layout` } }]);
      if (!r.ok) { patch(i, { error: r.error }); return; }
      patch(i, { saved: { ...ex.saved, [hash]: true }, error: undefined });
      router.refresh();
    });
  };

  const anyChosen = examples.some((e) => e.stage === "chosen" || e.stage === "failed");
  const anyRead = examples.some((e) => e.stage === "read");
  useEffect(() => { /* keep the list stable across renders */ }, [examples.length]);

  return (
    <Card title="Your suppliers' paperwork">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Drop in one example from each supplier: an invoice, an order confirmation or an order form, as a spreadsheet, a PDF or a photo. Flöda reads each one now and shows you what it took every column for. Fix anything in the wrong place and it is remembered for that supplier, so the real invoices read the way you left these.
        {templates > 0 && <> So far <strong>{templates}</strong> layout{templates === 1 ? " is" : "s are"} remembered.</>}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input ref={input} type="file" multiple accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.heic,.txt" className="hidden" id="supplier-examples" onChange={(e) => choose(e.target.files)} />
        <Button type="button" variant="secondary" icon="📄" disabled={running} onClick={() => input.current?.click()}>Choose example files</Button>
        {anyChosen && <Button type="button" variant="primary" icon="👓" disabled={running} onClick={() => void readAll()}>{running ? "Reading…" : "Read them"}</Button>}
      </div>

      <div className="space-y-4">
        {examples.map((ex, i) => (
          <div key={`${ex.file.name}-${i}`} className="rounded-[14px] border border-[var(--line-soft)] bg-[var(--canvas)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] font-semibold">
                Supplier
                <input value={ex.supplier} disabled={ex.stage !== "chosen" && ex.stage !== "failed"} onChange={(e) => patch(i, { supplier: e.target.value })} className={`${INPUT} w-44`} placeholder="Burton" />
              </label>
              <span className="text-[13px] text-[var(--ink-soft)]">{ex.file.name} · {Math.max(1, Math.round(ex.file.size / 1024))} KB</span>
              {ex.stage === "chosen" && <Badge>waiting</Badge>}
              {ex.stage === "uploading" && <Badge tone="info">uploading…</Badge>}
              {ex.stage === "reading" && <Badge tone="info">reading…</Badge>}
              {ex.stage === "read" && <Badge tone="success">{ex.state?.rows ?? 0} lines read{ex.state?.method ? ` · ${ex.state.method}` : ""}</Badge>}
              {ex.stage === "failed" && <Badge tone="warning">could not read</Badge>}
              {(ex.stage === "chosen" || ex.stage === "failed") && <button type="button" className="ml-auto text-[12px] text-[var(--ink-soft)] underline" onClick={() => setExamples((xs) => xs.filter((_, j) => j !== i))}>remove</button>}
            </div>
            {ex.error && <Alert tone="danger" className="mt-3">{ex.error}</Alert>}

            {ex.stage === "read" && ex.state && ex.state.groups.length === 0 && (
              <Alert tone="warning" className="mt-3">Nothing with a quantity or a price was found in it. If it is a spec sheet or a price list rather than an order, that is expected; try an invoice or order form instead.</Alert>
            )}

            {ex.stage === "read" && ex.state?.groups.map((g) => (
              <div key={g.hash} className="mt-3">
                {g.isCanonical ? (
                  <div className="text-[13.5px] text-[var(--ink-2)]">
                    Read by AI straight into product fields, so there are no columns to map. The lines are on the review grid, where anything read wrong is corrected the same way as on a real invoice and counted on this supplier&rsquo;s record.{" "}
                    {ex.batchId && <Link href={`/batches/${ex.batchId}/review`} className="font-semibold text-[var(--meta)]">Look at the lines →</Link>}
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-semibold">What each column was taken for</span>
                      {g.templateId && !ex.saved[g.hash] && <Badge tone="success">already remembered as {g.templateName}</Badge>}
                      {ex.saved[g.hash] && <Badge tone="success">remembered for {ex.supplier}</Badge>}
                      {!g.templateId && !ex.saved[g.hash] && (g.confident ? <Badge tone="info">looks right</Badge> : <Badge tone="warning">check these</Badge>)}
                    </div>
                    <div className="overflow-auto rounded-[10px] border border-[var(--line-soft)] bg-white">
                      <table className="w-full text-[13px]">
                        <thead className="text-left text-[11px] uppercase tracking-wide text-[var(--ink-soft)]"><tr><th className="px-3 py-1.5">Supplier column</th><th className="px-3 py-1.5">Sample values</th><th className="px-3 py-1.5">Flöda takes it as</th></tr></thead>
                        <tbody>
                          {g.headers.map((h) => (
                            <tr key={h} className="border-t border-[var(--line-soft)]">
                              <td className="px-3 py-1.5 font-medium">{h}</td>
                              <td className="max-w-[18rem] truncate px-3 py-1.5 text-[12px] text-[var(--ink-soft)]">{g.sampleRows.map((r) => r[h]).filter(Boolean).slice(0, 3).join(" · ") || "–"}</td>
                              <td className="px-3 py-1.5">
                                <select value={ex.mappings[g.hash]?.[h] ?? ""} disabled={pending || Boolean(ex.saved[g.hash])} onChange={(e) => patch(i, { mappings: { ...ex.mappings, [g.hash]: { ...ex.mappings[g.hash], [h]: e.target.value as Mapping[string] } } })} className="w-full max-w-[14rem] rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-[13px]">
                                  <option value="">(ignore this column)</option>
                                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!ex.saved[g.hash] && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" variant="primary" disabled={pending} onClick={() => remember(i, g.hash)}>{pending ? "Keeping…" : "That's right, remember it"}</Button>
                        <span className="text-[12px] text-[var(--ink-soft)]">Builds the products from this example too, so you can look them over on the review grid.</span>
                      </div>
                    )}
                    {ex.saved[g.hash] && ex.batchId && <div className="mt-2 text-[13px]"><Link href={`/batches/${ex.batchId}/review`} className="font-semibold text-[var(--meta)]">Look at what it built →</Link></div>}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
        <span>{anyRead || templates > 0 ? "You can add more suppliers any time from Home." : "You can do this later, one supplier at a time, as their paperwork comes in."}</span>
        <Button size="sm" variant={anyRead || templates > 0 ? "primary" : "ghost"} disabled={pending || running} onClick={() => start(async () => { if (!anyRead && templates === 0) await skipSetupStepAction("suppliers"); router.push(next); })}>{anyRead || templates > 0 ? "Continue →" : "Skip for now"}</Button>
      </div>
    </Card>
  );
}
