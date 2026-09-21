"use client";

import { useRef, useState } from "react";
import { logAdjustmentAction, planAdjustmentAction } from "@/app/(catalog)/actions";
import { applyPlan, describeFile, isWholeFile, type AdjustResult, type Plan } from "@/lib/catalog/adjust";
import { Alert, Button, Card, Field, INPUT, cx } from "@/app/(catalog)/ui";

/**
 * Changing prices and moving stock into clearance, on products the shop already sells.
 *
 * The file is read, changed and saved in the browser. A whole-catalogue Shopify export runs to
 * several megabytes — past what a serverless request will take — and it never needs to leave the
 * machine: only the vendors, types and tags in it are sent, which is all an instruction needs to
 * be grounded in. What was done is written to the audit log afterwards.
 *
 * Nothing is applied until the change list has been shown. This edits a live catalogue, so the
 * order is deliberately: say it, see exactly what moves, then save.
 */
interface FileFacts { products: number; variantRows: number; vendors: string[]; types: string[]; tags: string[] }

export function AdjustPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [facts, setFacts] = useState<FileFacts | null>(null);
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<{ plan: Plan; understood: string; unclear: string; described: string[] } | null>(null);
  const [preview, setPreview] = useState<AdjustResult | null>(null);
  const [busy, setBusy] = useState<"reading" | "planning" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const reset = () => { setPlan(null); setPreview(null); setSaved(null); setError(null); };

  async function take(file: File) {
    setBusy("reading");
    reset();
    try {
      const body = await file.text();
      const f = describeFile(body);
      if (f.products === 0) {
        setError("No products in that file. It should be a Shopify product export — Products → Export in Shopify admin.");
        setText(null); setFacts(null);
        return;
      }
      setText(body); setFacts(f); setFilename(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function work() {
    if (!text || !facts || !instruction.trim()) return;
    setBusy("planning");
    reset();
    try {
      const r = await planAdjustmentAction(instruction, { products: facts.products, vendors: facts.vendors, types: facts.types, tags: facts.tags });
      if (!r.ok) { setError(r.error); return; }
      setPlan(r.data!);
      setPreview(applyPlan(text, r.data!.plan));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    if (!preview || !plan) return;
    const name = filename.replace(/\.csv$/i, "") || "products";
    const out = `${name}-adjusted.csv`;
    const url = URL.createObjectURL(new Blob([preview.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = out;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSaved(out);
    void logAdjustmentAction({
      instruction, described: plan.described, matched: preview.matched,
      products: preview.products, changes: preview.changes.length, filename: out,
    });
  }

  const wholeFile = plan ? isWholeFile(plan.plan.scope) : false;
  const nothingToDo = preview !== null && preview.changes.length === 0;

  return (
    <div className="space-y-6">
      {!aiEnabled && (
        <Alert tone="warning">
          No API key is set, so an instruction cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.
        </Alert>
      )}

      <Card title="1. The file from Shopify">
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          In Shopify: <strong>Products → Export</strong>. Export the products you want to change — a collection, a search, or all of them. The file comes back with only the cells you asked about different, ready to import again.
        </p>
        <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void take(f); }}>
          <div className="text-sm font-medium text-[var(--ink)]">{busy === "reading" ? "Reading…" : text ? filename : "Drop the export here, or choose a file"}</div>
          <div className="mt-3">
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy !== null}>Choose file</Button>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); e.target.value = ""; }} />
          </div>
        </div>
        {facts && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span><strong className="tabular-nums">{facts.products}</strong> products</span>
            <span><strong className="tabular-nums">{facts.variantRows}</strong> variant rows</span>
            <span className="text-[var(--ink-soft)]">{facts.vendors.slice(0, 6).join(", ")}{facts.vendors.length > 6 ? ` +${facts.vendors.length - 6} more` : ""}</span>
          </div>
        )}
      </Card>

      {text && facts && (
        <Card title="2. What to change">
          <Field label="Say it the way you would say it to someone" hint='For example: "Put all the Karbon jackets 30% off and into clearance", or "take Oakley off sale", or "everything tagged 2024 goes to 50% off and draft".'>
            <textarea rows={3} value={instruction} onChange={(e) => { setInstruction(e.target.value); reset(); }} className={INPUT} placeholder="Put all the Karbon jackets 30% off and into clearance" />
          </Field>
          <div className="mt-3">
            <Button variant="primary" disabled={!aiEnabled || busy !== null || !instruction.trim()} onClick={() => void work()}>
              {busy === "planning" ? "Working it out…" : "Work out what to change"}
            </Button>
          </div>
        </Card>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {plan && preview && (
        <Card title="3. Check it before you save">
          <Alert tone={wholeFile || nothingToDo ? "warning" : "info"}>
            <div className="font-semibold">{plan.understood}</div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{plan.described.map((line, i) => <li key={i}>{line}</li>)}</ul>
            {plan.unclear && <div className="mt-2 text-xs"><strong>Not sure about:</strong> {plan.unclear}</div>}
          </Alert>

          {wholeFile && <Alert tone="warning" className="mt-3">This names no brand, type or tag, so it applies to <strong>every one of the {preview.products} products</strong> in the file. If that is not what you meant, say which products and work it out again.</Alert>}
          {preview.warnings.map((w, i) => <Alert key={i} tone="warning" className="mt-3">{w}</Alert>)}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span><strong className="tabular-nums">{preview.matched}</strong> of {preview.products} products match</span>
            <span><strong className="tabular-nums">{preview.changes.length}</strong> cell{preview.changes.length === 1 ? "" : "s"} change</span>
          </div>

          {nothingToDo ? (
            <Alert tone="warning" className="mt-3">Nothing would change. Either no product matches, or they are already as the instruction describes.</Alert>
          ) : (
            <>
              <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-[var(--line)]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--alp-snow)] text-left">
                    <tr>
                      <th className="px-2.5 py-1.5 font-semibold">Product</th>
                      <th className="px-2.5 py-1.5 font-semibold">Column</th>
                      <th className="px-2.5 py-1.5 font-semibold">Now</th>
                      <th className="px-2.5 py-1.5 font-semibold">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.slice(0, 200).map((c, i) => (
                      <tr key={i} className="border-t border-[var(--line-soft)] align-top">
                        <td className="px-2.5 py-1.5"><div className="font-medium">{c.title || c.handle}</div><div className="font-mono text-[10px] text-[var(--ink-soft)]">{c.handle}</div></td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--ink-soft)]">{c.column}</td>
                        <td className="px-2.5 py-1.5"><span className="line-clamp-2 text-[var(--ink-soft)]">{c.before || "—"}</span></td>
                        <td className={cx("px-2.5 py-1.5 font-medium", c.column === "Variant Price" && "text-[var(--violet)]")}><span className="line-clamp-2">{c.after || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.changes.length > 200 && <p className="mt-2 text-xs text-[var(--ink-soft)]">Showing the first 200 of {preview.changes.length}. All of them are in the file.</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={save}>Save the changed CSV</Button>
                <span className="text-xs text-[var(--ink-soft)]">Then import it in Shopify admin → Products → Import. Shopify matches on handle, so it updates rather than creating.</span>
              </div>
            </>
          )}
          {saved && <Alert tone="success" className="mt-3">Saved {saved}. Import it in Shopify admin → Products → Import, and tick <strong>Overwrite existing products</strong> so the changes apply.</Alert>}
        </Card>
      )}
    </div>
  );
}
