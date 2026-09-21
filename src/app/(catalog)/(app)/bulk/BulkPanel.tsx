"use client";

import { useRef, useState } from "react";
import { logAdjustmentAction, planAdjustmentAction } from "@/app/(catalog)/actions";
import { applyPlan, describeFile, isWholeFile, type AdjustResult, type Plan } from "@/lib/catalog/adjust";
import { Alert, Button, Card, INPUT, cx } from "@/app/(catalog)/ui";

/**
 * Bulk changes to products the shop already sells.
 *
 * Built as a feed rather than a form, because that is how the work actually arrives: "30% off the
 * Karbon jackets", then "and the 2024 stock goes to draft", then "actually put Oakley back to full
 * price". Each instruction is worked out, shown as the exact list of cells it would move, and only
 * then applied to the working file — so they stack, and any one of them can be taken back off.
 *
 * The file is read, changed and saved in the browser. A catalogue export runs to several megabytes,
 * past what a serverless request will take, and it never needs to leave the machine: only the
 * vendors, types and tags go to the server, which is all an instruction needs to be grounded in.
 *
 * The download is never gated. Once a file is loaded it can be saved at any point, with however
 * many instructions have been applied — including none.
 */
interface FileFacts { products: number; variantRows: number; vendors: string[]; types: string[]; tags: string[] }
interface Applied { instruction: string; described: string[]; changes: number; matched: number }

export function BulkPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [facts, setFacts] = useState<FileFacts | null>(null);
  // The working file, and the state before each applied instruction so any one can be undone.
  const [working, setWorking] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [feed, setFeed] = useState<Applied[]>([]);

  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState<{ plan: Plan; understood: string; unclear: string; described: string[]; result: AdjustResult } | null>(null);
  const [busy, setBusy] = useState<"reading" | "planning" | null>(null);
  // Editing every product in the file is occasionally what someone means and never what they mean
  // by accident. It is the shape a misread instruction takes, so it is the one thing that asks.
  const [confirmWholeFile, setConfirmWholeFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function take(file: File) {
    setBusy("reading");
    setError(null); setPending(null); setSaved(null);
    try {
      const body = await file.text();
      const f = describeFile(body);
      if (f.products === 0) {
        setError("No products in that file. It should be a Shopify product export — Products → Export in Shopify admin.");
        return;
      }
      setWorking(body); setFacts(f); setFilename(file.name); setFeed([]); setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function workOut() {
    if (!working || !facts || !instruction.trim()) return;
    setBusy("planning"); setError(null); setPending(null); setSaved(null);
    try {
      const r = await planAdjustmentAction(instruction, { products: facts.products, vendors: facts.vendors, types: facts.types, tags: facts.tags });
      if (!r.ok) { setError(r.error); return; }
      setConfirmWholeFile(false);
      setPending({ ...r.data!, result: applyPlan(working, r.data!.plan) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function apply() {
    if (!pending || !working || pending.result.refused) return;
    if (isWholeFile(pending.plan.scope) && !confirmWholeFile) return;
    setHistory((h) => [...h, working]);
    setWorking(pending.result.csv);
    setFeed((f) => [...f, { instruction, described: pending.described, changes: pending.result.changes.length, matched: pending.result.matched }]);
    setInstruction("");
    setPending(null);
    setConfirmWholeFile(false);
    setSaved(null);
  }

  function undo() {
    const previous = history[history.length - 1];
    if (previous === undefined) return;
    setWorking(previous);
    setHistory((h) => h.slice(0, -1));
    setFeed((f) => f.slice(0, -1));
    setPending(null);
    setSaved(null);
  }

  function save() {
    if (!working) return;
    const base = filename.replace(/\.csv$/i, "") || "products";
    const out = `${base}-updated.csv`;
    const url = URL.createObjectURL(new Blob([working], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = out;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSaved(out);
    void logAdjustmentAction({
      instruction: feed.map((f) => f.instruction).join(" | "),
      described: feed.flatMap((f) => f.described),
      matched: feed.reduce((n, f) => Math.max(n, f.matched), 0),
      products: facts?.products ?? 0,
      changes: feed.reduce((n, f) => n + f.changes, 0),
      filename: out,
    });
  }

  const wholeFile = pending ? isWholeFile(pending.plan.scope) : false;
  const refused = pending?.result.refused === true;
  const nothingToDo = pending !== null && !refused && pending.result.changes.length === 0;
  const totalChanges = feed.reduce((n, f) => n + f.changes, 0);

  return (
    <div className="space-y-6">
      {!aiEnabled && <Alert tone="warning">No API key is set, so an instruction cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>}

      <Card title="The file from Shopify">
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          In Shopify: <strong>Products → Export</strong>. Export what you want to change — a collection, a search, or everything. Only the cells you ask about come back different.
        </p>
        <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void take(f); }}>
          <div className="text-sm font-medium text-[var(--ink)]">{busy === "reading" ? "Reading…" : working ? filename : "Drop the export here, or choose a file"}</div>
          <div className="mt-3">
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy !== null}>{working ? "Choose a different file" : "Choose file"}</Button>
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

      {working && facts && (
        <Card
          title="Instructions"
          actions={<>
            {feed.length > 0 && <Button size="sm" onClick={undo}>Undo last</Button>}
            <Button size="sm" variant="primary" onClick={save}>Download the CSV</Button>
          </>}
        >
          {/* The feed: everything applied to this file so far, newest last. */}
          {feed.length > 0 && (
            <ol className="mb-4 space-y-2">
              {feed.map((f, i) => (
                <li key={i} className="rounded-lg border border-[var(--line-soft)] bg-[var(--alp-snow)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{i + 1}. {f.instruction}</span>
                    <span className="text-xs text-[var(--ink-soft)]">{f.matched} product{f.matched === 1 ? "" : "s"} · {f.changes} cell{f.changes === 1 ? "" : "s"}</span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-[var(--ink-soft)]">{f.described.map((line, j) => <li key={j}>{line}</li>)}</ul>
                </li>
              ))}
            </ol>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--ink-2)]">{feed.length > 0 ? "And then…" : "Say it the way you would say it to someone"}</span>
            <textarea
              rows={2}
              value={instruction}
              onChange={(e) => { setInstruction(e.target.value); setPending(null); }}
              className={INPUT}
              placeholder={feed.length > 0 ? "…and put the 2024 stock into draft" : "Put all the Karbon jackets 30% off and into clearance"}
            />
            <span className="mt-1 block text-xs text-[var(--ink-soft)]">
              One change at a time reads best. Each one applies on top of the last, and any of them can be undone.
            </span>
          </label>
          <div className="mt-3">
            <Button variant="primary" disabled={!aiEnabled || busy !== null || !instruction.trim()} onClick={() => void workOut()}>
              {busy === "planning" ? "Working it out…" : "Work out what would change"}
            </Button>
          </div>

          {feed.length > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-soft)]">
              <strong className="tabular-nums">{totalChanges}</strong> cell{totalChanges === 1 ? "" : "s"} changed so far. The download button above gives you the file as it stands.
            </p>
          )}
        </Card>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved {saved}. Import it in Shopify admin → Products → Import, and tick <strong>Overwrite existing products</strong> so the changes apply.</Alert>}

      {pending && (
        <Card title="Check this before it is applied">
          <Alert tone={wholeFile || nothingToDo ? "warning" : "info"}>
            <div className="font-semibold">{pending.understood}</div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{pending.described.map((line, i) => <li key={i}>{line}</li>)}</ul>
            {pending.unclear && <div className="mt-2 text-xs"><strong>Not sure about:</strong> {pending.unclear}</div>}
          </Alert>

          {refused && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">Stopped, and nothing was changed.</div>
              <p className="mt-1 text-sm">Before changing anything this page proves that nothing would move except what you asked for. That check failed, so the file has been left exactly as it was. This is a fault in the app — please send this to whoever maintains it.</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-[11px]">{pending.result.warnings.slice(1).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </Alert>
          )}
          {!refused && wholeFile && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">This would change every one of the {pending.result.products} products in the file.</div>
              <p className="mt-1 text-sm">Nothing in it narrows to a brand, a type or a tag. That is occasionally what someone means, and it is also the shape a misread instruction takes — so it asks first. If you meant a subset, say which and work it out again.</p>
              <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={confirmWholeFile} onChange={(e) => setConfirmWholeFile(e.target.checked)} /> Yes, every product in the file
              </label>
            </Alert>
          )}
          {!refused && pending.result.warnings.map((w, i) => <Alert key={i} tone="warning" className="mt-3">{w}</Alert>)}

          {!refused && (
            <>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span><strong className="tabular-nums">{pending.result.matched}</strong> of {pending.result.products} products match</span>
                <span><strong className="tabular-nums">{pending.result.changes.length}</strong> cell{pending.result.changes.length === 1 ? "" : "s"} would change</span>
              </div>
              {nothingToDo ? (
                <Alert tone="warning" className="mt-3">Nothing would change. Either no product matches, or they are already as this describes.</Alert>
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
                        {pending.result.changes.slice(0, 200).map((c, i) => (
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
                  {pending.result.changes.length > 200 && <p className="mt-2 text-xs text-[var(--ink-soft)]">Showing the first 200 of {pending.result.changes.length}.</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button variant="primary" disabled={wholeFile && !confirmWholeFile} onClick={apply}>Apply this</Button>
                    <Button onClick={() => setPending(null)}>Discard</Button>
                    <span className="text-xs text-[var(--ink-soft)]">Applying adds it to the list above. Nothing leaves this page until you download.</span>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
