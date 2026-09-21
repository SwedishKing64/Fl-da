"use client";

import { useRef, useState } from "react";
import { logAdjustmentAction, planAdjustmentAction, readInstructionSheetAction } from "@/app/(catalog)/actions";
import { applyPlan, describeFile, isWholeFile, type AdjustResult, type Plan } from "@/lib/catalog/adjust";
import { Alert, Button, Card, INPUT, cx } from "@/app/(catalog)/ui";

/**
 * Bulk changes to products the shop already sells.
 *
 * Several exports at once, because the catalogue comes out of Shopify in pieces — a file per
 * collection, or per search — and the season's changes cut across them. An instruction is read
 * once and applied to every file that has something matching it; a rule about Spyder simply finds
 * nothing in the file of Oakley goggles, which is the right answer rather than an error.
 *
 * Instructions arrive two ways: typed, or as the buyer's sheet. A sheet is many rules about many
 * products, so it is split into its separate changes first and each one goes through exactly the
 * same reading, preview and apply as something typed by hand. Nothing is applied unseen.
 *
 * Files are read, changed and saved in the browser. A catalogue export runs to megabytes, past
 * what a serverless request will take, and never needs to leave the machine — only the vendors,
 * types and tags go to the server, which is all an instruction needs to be grounded in.
 */
interface Sheet {
  name: string;
  /** The file as it stands, and the state before each applied instruction so any can be undone. */
  csv: string;
  history: string[];
  products: number;
  variantRows: number;
  vendors: string[];
  types: string[];
  tags: string[];
}

interface Applied { instruction: string; described: string[]; changes: number; matched: number; perFile: Array<{ name: string; changes: number }> }
interface Preview { instruction: string; plan: Plan; understood: string; unclear: string; blocked: string[]; described: string[]; results: Array<{ name: string; result: AdjustResult }> }

const read = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
  r.onerror = () => reject(new Error(`Could not read ${file.name}`));
  r.readAsDataURL(file);
});

export function BulkPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const csvRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [feed, setFeed] = useState<Applied[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueNote, setQueueNote] = useState<{ source: string; ignored: string[]; unclear: string } | null>(null);

  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"files" | "sheet" | "planning" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmWholeFile, setConfirmWholeFile] = useState(false);

  async function takeCsvs(files: FileList | File[]) {
    setBusy("files"); setError(null); setPreview(null); setSaved(null);
    const added: Sheet[] = [];
    const rejected: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const csv = await file.text();
        const f = describeFile(csv);
        if (f.products === 0) { rejected.push(file.name); continue; }
        added.push({ name: file.name, csv, history: [], ...f });
      }
      if (added.length === 0) {
        setError(`No products found in ${rejected.join(", ") || "that file"}. These should be Shopify product exports — Products → Export in Shopify admin.`);
        return;
      }
      if (rejected.length) setError(`Skipped ${rejected.join(", ")} — no products in ${rejected.length === 1 ? "it" : "them"}.`);
      // Replacing a file already loaded rather than holding two copies of it.
      setSheets((s) => [...s.filter((x) => !added.some((a) => a.name === x.name)), ...added]);
      setFeed([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function takeSheet(file: File) {
    setBusy("sheet"); setError(null); setPreview(null);
    try {
      const r = await readInstructionSheetAction({ name: file.name, type: file.type, base64: await read(file) });
      if (!r.ok) { setError(r.error); return; }
      setQueue(r.data!.instructions);
      setQueueNote({ source: `${file.name} · ${r.data!.source}`, ignored: r.data!.ignored, unclear: r.data!.unclear });
      setInstruction(r.data!.instructions[0] ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function workOut(text = instruction) {
    if (sheets.length === 0 || !text.trim()) return;
    setBusy("planning"); setError(null); setPreview(null); setSaved(null); setConfirmWholeFile(false);
    try {
      // One reading, grounded in everything across all the loaded files.
      const merge = (pick: (s: Sheet) => string[]) => [...new Set(sheets.flatMap(pick))].sort();
      const r = await planAdjustmentAction(text, {
        products: sheets.reduce((n, s) => n + s.products, 0),
        vendors: merge((s) => s.vendors), types: merge((s) => s.types), tags: merge((s) => s.tags),
      });
      if (!r.ok) { setError(r.error); return; }
      setPreview({
        instruction: text,
        ...r.data!,
        results: sheets.map((s) => ({ name: s.name, result: applyPlan(s.csv, r.data!.plan) })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function apply() {
    if (!preview || preview.results.some((r) => r.result.refused)) return;
    if (isWholeFile(preview.plan.scope) && !confirmWholeFile) return;
    setSheets((current) => current.map((s) => {
      const hit = preview.results.find((r) => r.name === s.name);
      return hit ? { ...s, history: [...s.history, s.csv], csv: hit.result.csv } : s;
    }));
    setFeed((f) => [...f, {
      instruction: preview.instruction,
      described: preview.described,
      changes: preview.results.reduce((n, r) => n + r.result.changes.length, 0),
      matched: preview.results.reduce((n, r) => n + r.result.matched, 0),
      perFile: preview.results.map((r) => ({ name: r.name, changes: r.result.changes.length })),
    }]);
    const rest = queue.slice(1);
    setQueue(rest);
    setInstruction(rest[0] ?? "");
    setPreview(null);
    setConfirmWholeFile(false);
    setSaved(null);
  }

  function skip() {
    const rest = queue.slice(1);
    setQueue(rest);
    setInstruction(rest[0] ?? "");
    setPreview(null);
  }

  function undo() {
    if (feed.length === 0) return;
    setSheets((current) => current.map((s) => (s.history.length ? { ...s, csv: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s)));
    setFeed((f) => f.slice(0, -1));
    setPreview(null);
    setSaved(null);
  }

  function download(sheet: Sheet) {
    const base = sheet.name.replace(/\.csv$/i, "") || "products";
    const out = `${base}-updated.csv`;
    const url = URL.createObjectURL(new Blob([sheet.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = out;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return out;
  }

  function downloadAll() {
    const names = sheets.map(download);
    setSaved(names.join(", "));
    void logAdjustmentAction({
      instruction: feed.map((f) => f.instruction).join(" | "),
      described: feed.flatMap((f) => f.described),
      matched: feed.reduce((n, f) => Math.max(n, f.matched), 0),
      products: sheets.reduce((n, s) => n + s.products, 0),
      changes: feed.reduce((n, f) => n + f.changes, 0),
      filename: names.join(", "),
    });
  }

  const wholeFile = preview ? isWholeFile(preview.plan.scope) : false;
  const refused = preview?.results.some((r) => r.result.refused) === true;
  const totalChanges = preview?.results.reduce((n, r) => n + r.result.changes.length, 0) ?? 0;
  const totalMatched = preview?.results.reduce((n, r) => n + r.result.matched, 0) ?? 0;
  const blocked = preview !== null && preview.blocked.length > 0;
  const nothingToDo = preview !== null && !refused && !blocked && totalChanges === 0;
  const noOperations = preview !== null && preview.plan.operations.length === 0;
  const changesSoFar = feed.reduce((n, f) => n + f.changes, 0);

  return (
    <div className="space-y-6">
      {!aiEnabled && <Alert tone="warning">No API key is set, so instructions cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>}

      <Card title="The files from Shopify" actions={sheets.length > 0 ? <Button size="sm" variant="primary" onClick={downloadAll}>Download {sheets.length === 1 ? "the CSV" : `all ${sheets.length}`}</Button> : undefined}>
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          In Shopify: <strong>Products → Export</strong>. Add as many exports as you like — an instruction is applied to every one of them, and simply finds nothing in a file that has nothing matching.
        </p>
        <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void takeCsvs(e.dataTransfer.files); }}>
          <div className="text-sm font-medium text-[var(--ink)]">{busy === "files" ? "Reading…" : "Drop exports here, or choose files"}</div>
          <div className="mt-3">
            <Button size="sm" onClick={() => csvRef.current?.click()} disabled={busy !== null}>Choose files</Button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void takeCsvs(e.target.files); e.target.value = ""; }} />
          </div>
        </div>
        {sheets.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--line-soft)] text-sm">
            {sheets.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs text-[var(--ink-soft)]">{s.products} products · {s.variantRows} rows · {s.vendors.slice(0, 4).join(", ")}{s.vendors.length > 4 ? ` +${s.vendors.length - 4}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setSaved(download(s))}>Download</Button>
                  <Button size="sm" variant="danger" onClick={() => { setSheets((x) => x.filter((y) => y.name !== s.name)); setPreview(null); }}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sheets.length > 0 && (
        <Card title="Instructions" actions={feed.length > 0 ? <Button size="sm" onClick={undo}>Undo last</Button> : undefined}>
          {feed.length > 0 && (
            <ol className="mb-4 space-y-2">
              {feed.map((f, i) => (
                <li key={i} className="rounded-lg border border-[var(--line-soft)] bg-[var(--alp-snow)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{i + 1}. {f.instruction}</span>
                    <span className="text-xs text-[var(--ink-soft)]">{f.matched} product{f.matched === 1 ? "" : "s"} · {f.changes} cell{f.changes === 1 ? "" : "s"}</span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-[var(--ink-soft)]">{f.described.map((line, j) => <li key={j}>{line}</li>)}</ul>
                  {sheets.length > 1 && <div className="mt-1 text-[11px] text-[var(--ink-soft)]">{f.perFile.filter((p) => p.changes > 0).map((p) => `${p.name}: ${p.changes}`).join(" · ") || "no file changed"}</div>}
                </li>
              ))}
            </ol>
          )}

          {/* The buyer's sheet: many rules, queued and taken one at a time. */}
          <div className="mb-4 rounded-lg border border-dashed border-[var(--line)] px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">Have the changes written down?</span>
                <span className="ml-2 text-xs text-[var(--ink-soft)]">A PDF, a photo of a printed page, or a text file. It is split into its separate changes and you take them one at a time.</span>
              </div>
              <Button size="sm" disabled={!aiEnabled || busy !== null} onClick={() => sheetRef.current?.click()}>{busy === "sheet" ? "Reading…" : "Add an instruction sheet"}</Button>
              <input ref={sheetRef} type="file" accept=".pdf,.txt,.md,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeSheet(f); e.target.value = ""; }} />
            </div>
            {queueNote && (
              <div className="mt-2 text-xs text-[var(--ink-soft)]">
                <strong>{queueNote.source}</strong> — {queue.length} change{queue.length === 1 ? "" : "s"} left to go through.
                {queueNote.ignored.length > 0 && (
                  <div className="mt-1">
                    <strong>Left alone ({queueNote.ignored.length})</strong> — a heading, or a row with no year tag stated. Nothing here was changed:
                    <ul className="mt-1 list-disc pl-5">
                      {queueNote.ignored.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </div>
                )}
                {queueNote.unclear && <span className="block text-amber-800">Could not turn into a change: {queueNote.unclear}</span>}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--ink-2)]">
              {queue.length > 0 ? `Change ${feed.length + 1} of ${feed.length + queue.length}, from the sheet` : feed.length > 0 ? "And then…" : "Say it the way you would say it to someone"}
            </span>
            <textarea rows={2} value={instruction} onChange={(e) => { setInstruction(e.target.value); setPreview(null); }} className={INPUT} placeholder="Put all the Karbon jackets 30% off and into clearance" />
            <span className="mt-1 block text-xs text-[var(--ink-soft)]">Each one applies on top of the last, across every file, and any of them can be undone.</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!aiEnabled || busy !== null || !instruction.trim()} onClick={() => void workOut()}>
              {busy === "planning" ? "Working it out…" : "Work out what would change"}
            </Button>
            {queue.length > 0 && <Button onClick={skip}>Skip this one</Button>}
          </div>

          {feed.length > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-soft)]">
              <strong className="tabular-nums">{changesSoFar}</strong> cell{changesSoFar === 1 ? "" : "s"} changed so far across {sheets.length} file{sheets.length === 1 ? "" : "s"}. The download buttons above give you the files as they stand.
            </p>
          )}
        </Card>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved {saved}. Import each in Shopify admin → Products → Import, and tick <strong>Overwrite existing products</strong> so the changes apply.</Alert>}

      {preview && (
        <Card title="Check this before it is applied">
          <Alert tone={wholeFile || nothingToDo ? "warning" : "info"}>
            <div className="font-semibold">{preview.understood}</div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{preview.described.map((line, i) => <li key={i}>{line}</li>)}</ul>
            {preview.unclear && <div className="mt-2 text-xs"><strong>Not sure about:</strong> {preview.unclear}</div>}
          </Alert>

          {refused && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">Stopped, and nothing was changed.</div>
              <p className="mt-1 text-sm">Before changing anything this page proves that nothing would move except what you asked for. That check failed, so the files have been left exactly as they were. This is a fault in the app — please send this to whoever maintains it.</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-[11px]">{preview.results.flatMap((r) => r.result.warnings.slice(1)).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </Alert>
          )}
          {blocked && !refused && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">Not applied — this would have changed more than it asked for.</div>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{preview.blocked.map((b, i) => <li key={i}>{b}</li>)}</ul>
              <p className="mt-2 text-sm">Either the products it names are in an export that is not loaded, or the shop spells that brand or category differently. Load the missing export, or skip this one and do it by hand.</p>
            </Alert>
          )}
          {!refused && !blocked && wholeFile && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">This would change every product in {sheets.length === 1 ? "the file" : "all the files"}.</div>
              <p className="mt-1 text-sm">Nothing in it narrows to a brand, a type or a tag. That is occasionally what someone means, and it is also the shape a misread instruction takes — so it asks first.</p>
              <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={confirmWholeFile} onChange={(e) => setConfirmWholeFile(e.target.checked)} /> Yes, every product
              </label>
            </Alert>
          )}
          {!refused && !blocked && preview.results.flatMap((r) => r.result.warnings).map((w, i) => <Alert key={i} tone="warning" className="mt-3">{w}</Alert>)}

          {!refused && !blocked && (
            <>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span><strong className="tabular-nums">{totalMatched}</strong> products match</span>
                <span><strong className="tabular-nums">{totalChanges}</strong> cell{totalChanges === 1 ? "" : "s"} would change</span>
              </div>
              {sheets.length > 1 && (
                <ul className="mt-2 text-xs text-[var(--ink-soft)]">
                  {preview.results.map((r) => <li key={r.name}>{r.name}: {r.result.matched} matched, {r.result.changes.length} cell{r.result.changes.length === 1 ? "" : "s"}</li>)}
                </ul>
              )}

              {nothingToDo ? (
                <Alert tone="warning" className="mt-3">
                  {noOperations ? (
                    <>
                      <div className="font-semibold">No change was worked out from that.</div>
                      <p className="mt-1 text-sm">The products were found, but nothing was understood as something to <em>do</em> to them. Try naming the change plainly.{preview.unclear ? ` It said: ${preview.unclear}` : ""}</p>
                    </>
                  ) : totalMatched === 0 ? (
                    <>
                      <div className="font-semibold">No product in {sheets.length === 1 ? "this file" : "any of these files"} matches.</div>
                      <p className="mt-1 text-sm">The change was understood; nothing loaded fits the description above.</p>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold">All {totalMatched} matching products are already like this.</div>
                      <p className="mt-1 text-sm">Every one of them already carries what you asked for, so there is nothing to change.</p>
                    </>
                  )}
                </Alert>
              ) : (
                <>
                  <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-[var(--line)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--alp-snow)] text-left">
                        <tr>
                          {sheets.length > 1 && <th className="px-2.5 py-1.5 font-semibold">File</th>}
                          <th className="px-2.5 py-1.5 font-semibold">Product</th>
                          <th className="px-2.5 py-1.5 font-semibold">Column</th>
                          <th className="px-2.5 py-1.5 font-semibold">Now</th>
                          <th className="px-2.5 py-1.5 font-semibold">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.results.flatMap((r) => r.result.changes.map((c) => ({ file: r.name, c }))).slice(0, 200).map((row, i) => (
                          <tr key={i} className="border-t border-[var(--line-soft)] align-top">
                            {sheets.length > 1 && <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--ink-soft)]">{row.file}</td>}
                            <td className="px-2.5 py-1.5"><div className="font-medium">{row.c.title || row.c.handle}</div><div className="font-mono text-[10px] text-[var(--ink-soft)]">{row.c.handle}</div></td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--ink-soft)]">{row.c.column}</td>
                            <td className="px-2.5 py-1.5"><span className="line-clamp-2 text-[var(--ink-soft)]">{row.c.before || "—"}</span></td>
                            <td className={cx("px-2.5 py-1.5 font-medium", row.c.column === "Variant Price" && "text-[var(--violet)]")}><span className="line-clamp-2">{row.c.after || "—"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalChanges > 200 && <p className="mt-2 text-xs text-[var(--ink-soft)]">Showing the first 200 of {totalChanges}.</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button variant="primary" disabled={wholeFile && !confirmWholeFile} onClick={apply}>Apply this</Button>
                    <Button onClick={() => setPreview(null)}>Discard</Button>
                    {queue.length > 1 && <span className="text-xs text-[var(--ink-soft)]">{queue.length - 1} more from the sheet after this.</span>}
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
