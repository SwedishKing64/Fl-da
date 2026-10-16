"use client";

import { useRef, useState, useTransition } from "react";
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

/** What an earlier file in this sitting left behind, listed above the current one. */
interface Done { supplier: string; file: string; rows: number; remembered: boolean; batchId?: string }

/** "Burton_W27_order.pdf" → "Burton". The person can change it. */
function guessSupplier(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const first = stem.split(/[\s_\-.]+/).find((w) => w && !/^\d+$/.test(w)) ?? stem;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

const WAIT_MS = 4 * 60_000;

/**
 * One example of each supplier's paperwork, one file at a time: the file is read as soon as the
 * supplier is named, every column is shown against what Flöda took it for, the person corrects
 * anything in the wrong place, and the corrected layout is kept for that supplier. Then the next
 * supplier's file. The real invoices read the way these were left.
 */
export function SuppliersStep({ fields, templates, next, standalone }: { fields: FieldDef[]; templates: number; next?: string; standalone?: boolean }) {
  const router = useRouter();
  const [example, setExample] = useState<Example | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<Example>) => setExample((x) => (x ? { ...x, ...p } : x));
  const busy = example?.stage === "uploading" || example?.stage === "reading";

  const choose = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setExample({ file, supplier: guessSupplier(file.name), stage: "chosen", mappings: {}, saved: {} });
    if (input.current) input.current.value = "";
  };

  /** Put the current file aside as done and make room for the next supplier's. */
  const another = () => {
    if (example?.stage === "read") {
      setDone((d) => [...d, { supplier: example.supplier.trim(), file: example.file.name, rows: example.state?.rows ?? 0, remembered: Object.values(example.saved).some(Boolean) || Boolean(example.state?.groups.some((g) => g.isCanonical)), batchId: example.batchId }]);
    }
    setExample(null);
    setTimeout(() => input.current?.click(), 0);
  };

  /** Read the chosen file: a batch for it, the file in it, then the layout it came out with. */
  const read = async () => {
    if (!example) return;
    const supplier = example.supplier.trim();
    if (!supplier) { patch({ stage: "failed", error: "Say which supplier this is from." }); return; }
    patch({ stage: "uploading", error: undefined });
    try {
      const made = await createExampleBatchAction(supplier, example.file.name);
      if (!made.ok) throw new Error(made.error);
      const batchId = made.data!.batchId;
      patch({ batchId });
      const form = new FormData();
      form.append("files", example.file);
      form.append("autoMap", "0");
      const res = await fetch(`/api/catalog/batches/${batchId}/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `The upload failed (${res.status}).`);
      patch({ stage: "reading" });
      const started = Date.now();
      while (Date.now() - started < WAIT_MS) {
        await new Promise((r) => setTimeout(r, 1500));
        if ((await readingCountAction(batchId)) === 0) break;
      }
      const state = await exampleStateAction(batchId);
      if (!state.ok) throw new Error(state.error);
      const mappings: Record<string, Mapping> = {};
      for (const g of state.data!.groups) mappings[g.hash] = { ...g.suggestion };
      patch({ stage: state.data!.failed ? "failed" : "read", error: state.data!.failed ?? undefined, state: state.data!, mappings });
    } catch (err) {
      patch({ stage: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  };

  const remember = (hash: string) => {
    if (!example?.batchId || !example.state) return;
    const group = example.state.groups.find((g) => g.hash === hash);
    if (!group) return;
    start(async () => {
      const r = await applyMappingsAction(example.batchId!, [{ hash, mapping: example.mappings[hash], options: group.options, saveTemplate: { name: `${example.supplier.trim()} – ${example.file.name.split(".").pop()?.toUpperCase() ?? "file"} layout` } }]);
      if (!r.ok) { patch({ error: r.error }); return; }
      patch({ saved: { ...example.saved, [hash]: true }, error: undefined });
      router.refresh();
    });
  };

  const anyRead = done.length > 0 || example?.stage === "read";
  const editable = example?.stage === "chosen" || example?.stage === "failed";

  return (
    <Card title="Your suppliers' paperwork">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        One example from each supplier, one at a time: an invoice, an order confirmation or an order form, as a spreadsheet, a PDF or a photo. Flöda reads it straight away and shows you what it took every column for. Change anything in the wrong place, keep it, and it is remembered for that supplier, so their real invoices read the way you left this one. Then the next supplier&rsquo;s.
        {templates > 0 && <> So far <strong>{templates}</strong> layout{templates === 1 ? " is" : "s are"} remembered.</>}
      </p>

      {done.length > 0 && (
        <ul className="mb-4 space-y-1 text-[13px]">
          {done.map((d, i) => (
            <li key={`${d.file}-${i}`} className="flex flex-wrap items-center gap-2">
              <Badge tone={d.remembered ? "success" : "warning"}>{d.remembered ? "remembered" : "not kept"}</Badge>
              <span className="font-medium">{d.supplier}</span>
              <span className="text-[var(--ink-soft)]">{d.file} · {d.rows} line{d.rows === 1 ? "" : "s"}</span>
              {d.batchId && <Link href={`/batches/${d.batchId}/review`} className="text-[12px] font-semibold text-[var(--meta)]">look at it →</Link>}
            </li>
          ))}
        </ul>
      )}

      <input ref={input} type="file" accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.heic,.txt" className="hidden" id="supplier-example" onChange={(e) => choose(e.target.files)} />

      {!example && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" icon="📄" onClick={() => input.current?.click()}>{done.length > 0 || templates > 0 ? "Choose the next supplier's file" : "Choose a supplier's file"}</Button>
          <span className="text-[13px] text-[var(--ink-soft)]">One file. You name the supplier, Flöda reads it, you check the columns.</span>
        </div>
      )}

      {example && (
        <div className="rounded-[14px] border border-[var(--line-soft)] bg-[var(--canvas)] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              Supplier
              <input value={example.supplier} disabled={!editable} onChange={(e) => patch({ supplier: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && editable) void read(); }} className={`${INPUT} w-44`} placeholder="Burton" autoFocus />
            </label>
            <span className="text-[13px] text-[var(--ink-soft)]">{example.file.name} · {Math.max(1, Math.round(example.file.size / 1024))} KB</span>
            {example.stage === "uploading" && <Badge tone="info">uploading…</Badge>}
            {example.stage === "reading" && <Badge tone="info">reading…</Badge>}
            {example.stage === "read" && <Badge tone="success">{example.state?.rows ?? 0} lines read{example.state?.method ? ` · ${example.state.method}` : ""}</Badge>}
            {example.stage === "failed" && <Badge tone="warning">could not read</Badge>}
            {editable && (
              <span className="ml-auto flex items-center gap-3">
                <button type="button" className="text-[12px] text-[var(--ink-soft)] underline" onClick={() => setExample(null)}>remove</button>
                <Button type="button" size="sm" variant="primary" icon="👓" onClick={() => void read()}>{example.stage === "failed" ? "Try again" : "Read it"}</Button>
              </span>
            )}
          </div>
          {busy && <div className="mt-3 text-[13px] text-[var(--ink-soft)]">{example.stage === "uploading" ? "Sending the file…" : "Reading it. A spreadsheet takes a moment; a PDF or a photo a minute or two."}</div>}
          {example.error && <Alert tone="danger" className="mt-3">{example.error}</Alert>}

          {example.stage === "read" && example.state && example.state.groups.length === 0 && (
            <Alert tone="warning" className="mt-3">Nothing with a quantity or a price was found in it. If it is a spec sheet or a price list rather than an order, that is expected; try an invoice or order form instead.</Alert>
          )}

          {example.stage === "read" && example.state?.groups.map((g) => (
            <div key={g.hash} className="mt-3">
              {g.isCanonical ? (
                <div className="text-[13.5px] text-[var(--ink-2)]">
                  Read by AI straight into product fields, so there are no columns to map. The lines are on the review grid, where anything read wrong is corrected the same way as on a real invoice and counted on this supplier&rsquo;s record.{" "}
                  {example.batchId && <Link href={`/batches/${example.batchId}/review`} className="font-semibold text-[var(--meta)]">Look at the lines →</Link>}
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">What each column was taken for</span>
                    {g.templateId && !example.saved[g.hash] && <Badge tone="success">already remembered as {g.templateName}</Badge>}
                    {example.saved[g.hash] && <Badge tone="success">remembered for {example.supplier}</Badge>}
                    {!g.templateId && !example.saved[g.hash] && (g.confident ? <Badge tone="info">looks right</Badge> : <Badge tone="warning">check these</Badge>)}
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
                              <select value={example.mappings[g.hash]?.[h] ?? ""} disabled={pending || Boolean(example.saved[g.hash])} onChange={(e) => patch({ mappings: { ...example.mappings, [g.hash]: { ...example.mappings[g.hash], [h]: e.target.value as Mapping[string] } } })} className="w-full max-w-[14rem] rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-[13px]">
                                <option value="">(ignore this column)</option>
                                {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!example.saved[g.hash] && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="primary" disabled={pending} onClick={() => remember(g.hash)}>{pending ? "Keeping…" : "That's right, remember it"}</Button>
                      <span className="text-[12px] text-[var(--ink-soft)]">Builds the products from this example too, so you can look them over on the review grid.</span>
                    </div>
                  )}
                  {example.saved[g.hash] && example.batchId && <div className="mt-2 text-[13px]"><Link href={`/batches/${example.batchId}/review`} className="font-semibold text-[var(--meta)]">Look at what it built →</Link></div>}
                </>
              )}
            </div>
          ))}

          {(example.stage === "read" || example.stage === "failed") && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line-soft)] pt-3">
              <Button type="button" size="sm" variant="secondary" icon="📄" disabled={pending} onClick={another}>Add another supplier&rsquo;s file</Button>
              {example.stage === "read" && example.state?.groups.some((g) => !g.isCanonical && !example.saved[g.hash]) && <span className="text-[12px] text-[var(--ink-soft)]">Keep the layout above first if you want this supplier remembered.</span>}
            </div>
          )}
        </div>
      )}

      {!standalone && next && (
        <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
          <span>{anyRead || templates > 0 ? "You can add more suppliers any time from Training and Rules." : "You can do this later, one supplier at a time, as their paperwork comes in."}</span>
          <Button size="sm" variant={anyRead || templates > 0 ? "primary" : "ghost"} disabled={pending || busy} onClick={() => start(async () => { if (!anyRead && templates === 0) await skipSetupStepAction("suppliers"); router.push(next); })}>{anyRead || templates > 0 ? "Continue →" : "Skip for now"}</Button>
        </div>
      )}
    </Card>
  );
}
