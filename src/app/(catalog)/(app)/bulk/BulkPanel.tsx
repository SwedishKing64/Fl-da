"use client";

import { useRef, useState } from "react";
import { logAdjustmentAction, planAdjustmentAction, readInstructionSheetAction, readSheetAgainstFilesAction } from "@/app/(catalog)/actions";
import { applyPlan, describeFile, foldPlans, isWholeFile, type AdjustResult, type FoldStep, type Plan } from "@/lib/catalog/adjust";
import { csvFilename } from "@/lib/catalog/csv";
import { Alert, Button, Card, INPUT, cx } from "@/app/(catalog)/ui";

/**
 * Bulk changes to products the shop already sells.
 *
 * Several exports at once, because the catalogue comes out of Shopify in pieces — a file per
 * collection, or per search — and the season's changes cut across them.
 *
 * Instructions arrive two ways: typed, or as the buyer's sheet. A sheet is read against the files
 * that are actually loaded and laid out by product group. A season's sheet covers the whole shop
 * and an export is usually one corner of it, so the rows that cannot touch anything loaded are set
 * aside rather than walked through, and a shelf's worth of rows is approved together — being
 * walked through thirty-nine rows to apply three is most of the work of doing it by hand.
 *
 * Nothing is applied unseen: every row shows what it would change before it runs, and the check
 * that proves nothing moved except what was asked for runs per row however many are approved at
 * once. A group buys one approval and one undo, never a weaker check.
 *
 * Files are read, changed and saved in the browser. A catalogue export runs to megabytes, past
 * what a serverless request will take, and never needs to leave the machine — only the vendors,
 * types and tags go to the server, which is all an instruction needs to be grounded in.
 */
interface Sheet {
  name: string;
  /** The file as it stands, and the state before each applied step so any can be undone. */
  csv: string;
  history: string[];
  products: number;
  variantRows: number;
  vendors: string[];
  types: string[];
  tags: string[];
}

/** One row of the buyer's sheet, as read against the loaded files. */
interface Row {
  id: number;
  instruction: string;
  group: string;
  relevant: boolean;
  why: string;
  plan: Plan | null;
  understood: string;
  unclear: string;
  blocked: string[];
  described: string[];
  failed: string;
  state: "ready" | "applied" | "skipped";
  results: Array<{ name: string; result: AdjustResult }>;
}

interface Applied { title: string; lines: string[]; changes: number; matched: number; steps: number; perFile: Array<{ name: string; changes: number }> }
interface Preview { instruction: string; plan: Plan; understood: string; unclear: string; blocked: string[]; described: string[]; results: Array<{ name: string; result: AdjustResult }> }

const read = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
  r.onerror = () => reject(new Error(`Could not read ${file.name}`));
  r.readAsDataURL(file);
});

/** What a row would do to the files as they stand right now. */
const measure = (row: Row, csvs: Array<{ name: string; csv: string }>): Array<{ name: string; result: AdjustResult }> =>
  row.plan && row.state === "ready" && row.blocked.length === 0
    ? csvs.map((s) => ({ name: s.name, result: applyPlan(s.csv, row.plan as Plan) }))
    : [];

const countChanges = (results: Array<{ result: AdjustResult }>) => results.reduce((n, r) => n + r.result.changes.length, 0);
const countMatched = (results: Array<{ result: AdjustResult }>) => results.reduce((n, r) => n + r.result.matched, 0);

export function BulkPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const csvRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [feed, setFeed] = useState<Applied[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [sheetNote, setSheetNote] = useState<{ source: string; ignored: string[]; unclear: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirmedWhole, setConfirmedWhole] = useState<number[]>([]);

  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"files" | "sheet" | "planning" | "applying" | null>(null);
  const [progress, setProgress] = useState("");
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
      // The sheet was matched against the files that were loaded then, so it no longer holds.
      setRows([]); setSheetNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Read the buyer's sheet and lay it out against the loaded files.
   *
   * Two round trips, not forty. The sheet is split into its rows, then the whole lot is matched
   * and planned inside one server action — Next dispatches server actions one at a time per
   * client, so planning a row at a time from here would be a queue of round trips however quick
   * each one is.
   */
  async function takeSheet(file: File) {
    setBusy("sheet"); setError(null); setPreview(null); setRows([]); setSheetNote(null); setOpen(null); setConfirmedWhole([]);
    try {
      setProgress("Reading the sheet…");
      const r = await readInstructionSheetAction({ name: file.name, type: file.type, base64: await read(file) });
      if (!r.ok) { setError(r.error); return; }
      const instructions = r.data!.instructions;
      setSheetNote({ source: `${file.name} · ${r.data!.source}`, ignored: r.data!.ignored, unclear: r.data!.unclear });
      if (instructions.length === 0) return;

      setProgress(`Matching ${instructions.length} change${instructions.length === 1 ? "" : "s"} against your ${sheets.length === 1 ? "file" : "files"}…`);
      const merge = (pick: (s: Sheet) => string[]) => [...new Set(sheets.flatMap(pick))].sort();
      const m = await readSheetAgainstFilesAction(instructions, {
        products: sheets.reduce((n, s) => n + s.products, 0),
        vendors: merge((s) => s.vendors), types: merge((s) => s.types), tags: merge((s) => s.tags),
      });
      if (!m.ok) { setError(m.error); return; }

      setProgress("Working out what each one would change…");
      const built: Row[] = m.data!.rows.map((row, id) => ({ ...row, id, state: "ready", results: [] }));
      setRows(built.map((row) => ({ ...row, results: measure(row, sheets) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null); setProgress("");
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

  /**
   * Apply a set of rows as one step.
   *
   * Each row still runs on its own and is still checked on its own — the guard that proves nothing
   * moved except what was asked for runs per row, and a row that fails it is left out and named
   * rather than quietly taking the rest down with it. What the group buys is one approval and one
   * undo, not a weaker check.
   */
  function applyRows(ids: number[], title: string) {
    const wanted = rows.filter((r) => ids.includes(r.id) && r.state === "ready" && r.plan && r.blocked.length === 0
      && (!isWholeFile((r.plan as Plan).scope) || confirmedWhole.includes(r.id)));
    if (wanted.length === 0) {
      setError("Nothing was applied — every change in that group still needs its own confirmation.");
      return;
    }

    setBusy("applying"); setError(null); setSaved(null);
    const steps: FoldStep[] = wanted.map((r) => ({ id: r.id, plan: r.plan as Plan, label: r.understood || r.instruction }));
    const out = foldPlans(sheets.map((s) => ({ name: s.name, csv: s.csv })), steps);

    if (out.applied.length === 0) {
      setBusy(null);
      setError(`Nothing was applied. ${out.refused.length} change${out.refused.length === 1 ? "" : "s"} failed the check that nothing moves except what was asked for.`);
      return;
    }

    const nextSheets = sheets.map((s, i) => ({ ...s, history: [...s.history, s.csv], csv: out.files[i].csv }));
    setSheets(nextSheets);
    setFeed((f) => [...f, {
      title, lines: out.lines, changes: out.changes, matched: out.matched, steps: out.applied.length,
      perFile: out.files.map((f2) => ({ name: f2.name, changes: f2.changes })),
    }]);
    // Everything still to come is re-measured against the files as they now stand, so a later row
    // sees what an earlier one did and a row made redundant by it reports nothing left to change.
    setRows((current) => {
      const marked = current.map((r) => (out.applied.includes(r.id) ? { ...r, state: "applied" as const, results: [] } : r));
      return marked.map((r) => ({ ...r, results: measure(r, nextSheets) }));
    });
    if (out.refused.length) {
      setError(`${out.refused.length} change${out.refused.length === 1 ? " was" : "s were"} left out — ${out.refused.length === 1 ? "it" : "they"} failed the check that nothing moves except what was asked for. Everything else in the group was applied.`);
    }
    setBusy(null);
    setPreview(null);
  }

  function apply() {
    if (!preview || preview.results.some((r) => r.result.refused) || preview.blocked.length > 0) return;
    if (isWholeFile(preview.plan.scope) && !confirmWholeFile) return;
    const before = sheets.map((s) => s.csv);
    const nextSheets = sheets.map((s, i) => {
      const hit = preview.results.find((r) => r.name === s.name);
      // Same rule as a group apply: a file this change did not touch keeps the bytes it arrived
      // with, so re-importing a file nobody changed is a true no-op.
      const touched = hit !== undefined && (hit.result.changes.length > 0 || (hit.result.preambleRemoved ?? 0) > 0);
      // Every file gets a history entry whether it moved or not, so one undo is one step back for
      // all of them. Let the lengths drift and undo starts taking files back to different moments.
      return { ...s, history: [...s.history, before[i]], csv: touched ? hit.result.csv : s.csv };
    });
    setSheets(nextSheets);
    setFeed((f) => [...f, {
      title: preview.instruction,
      lines: preview.described,
      changes: countChanges(preview.results),
      matched: countMatched(preview.results),
      steps: 1,
      perFile: preview.results.map((r) => ({ name: r.name, changes: r.result.changes.length })),
    }]);
    setRows((current) => current.map((r) => ({ ...r, results: measure(r, nextSheets) })));
    setInstruction("");
    setPreview(null);
    setConfirmWholeFile(false);
    setSaved(null);
  }

  function setRowState(id: number, state: Row["state"]) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, state, results: measure({ ...r, state }, sheets) } : r)));
  }

  function undo() {
    if (feed.length === 0) return;
    const nextSheets = sheets.map((s) => (s.history.length ? { ...s, csv: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s));
    setSheets(nextSheets);
    setFeed((f) => f.slice(0, -1));
    // The files are what was undone. Rows already marked applied stay marked — reading the sheet
    // again is the clean way to start it over.
    setRows((current) => current.map((r) => ({ ...r, results: measure(r, nextSheets) })));
    setPreview(null);
    setSaved(null);
  }

  /**
   * Hand over one file.
   *
   * The name tells the truth about the contents. A file nothing was applied to keeps its own name:
   * calling it "-updated" when it is the file that went in is how someone re-imports an afternoon
   * of work that is not in there and only finds out from the shop.
   */
  function download(sheet: Sheet) {
    const out = csvFilename(sheet.name, appliedTo(sheet.name) > 0 ? "-updated" : "");
    const url = URL.createObjectURL(new Blob([sheet.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = out;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return out;
  }

  function downloadAll() {
    const names = sheets.filter((s) => appliedTo(s.name) > 0).map(download);
    if (names.length === 0) {
      setError("Nothing has been applied yet, so there is no updated file to download. Every file here is still the one you loaded.");
      return;
    }
    setSaved(names.join(", "));
    void logAdjustmentAction({
      instruction: feed.map((f) => f.title).join(" | "),
      described: feed.flatMap((f) => f.lines),
      matched: feed.reduce((n, f) => Math.max(n, f.matched), 0),
      products: sheets.reduce((n, s) => n + s.products, 0),
      changes: feed.reduce((n, f) => n + f.changes, 0),
      filename: names.join(", "),
    });
  }

  // How many cells have actually been written into each file. Derived from the feed rather than
  // held alongside it, so undo takes it back without a second thing to keep in step.
  const appliedTo = (name: string) => feed.reduce((n, f) => n + (f.perFile.find((p) => p.name === name)?.changes ?? 0), 0);
  const edited = sheets.filter((s) => appliedTo(s.name) > 0);

  const wholeFile = preview ? isWholeFile(preview.plan.scope) : false;
  const refused = preview?.results.some((r) => r.result.refused) === true;
  const totalChanges = countChanges(preview?.results ?? []);
  const totalMatched = countMatched(preview?.results ?? []);
  const blocked = preview !== null && preview.blocked.length > 0;
  const nothingToDo = preview !== null && !refused && !blocked && totalChanges === 0;
  const noOperations = preview !== null && preview.plan.operations.length === 0;
  const changesSoFar = feed.reduce((n, f) => n + f.changes, 0);

  // The sheet, laid out by product group. A row that cannot touch anything loaded is set aside
  // rather than queued, which is the difference between thirty-nine to go through and three.
  const relevant = rows.filter((r) => r.relevant);
  const setAside = rows.filter((r) => !r.relevant);
  const groupNames = [...new Set(relevant.map((r) => r.group || "Everything else"))];
  const groups = groupNames
    .map((name) => ({ name, rows: relevant.filter((r) => (r.group || "Everything else") === name) }))
    .sort((a, b) => b.rows.length - a.rows.length);
  const readyIn = (rs: Row[]) => rs.filter((r) => r.state === "ready" && r.plan && r.blocked.length === 0
    && countChanges(r.results) > 0
    && (!isWholeFile(r.plan.scope) || confirmedWhole.includes(r.id)));
  const allReady = readyIn(relevant);
  const stillToDo = relevant.filter((r) => r.state === "ready");

  return (
    <div className="space-y-6">
      {!aiEnabled && <Alert tone="warning">No API key is set, so instructions cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>}

      <Card
        title="The files from Shopify"
        actions={edited.length > 0
          ? <Button size="sm" variant="primary" onClick={downloadAll}>Download the {edited.length === 1 ? "updated file" : `${edited.length} updated files`}</Button>
          : undefined}
      >
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          In Shopify: <strong>Products → Export</strong>. Add as many exports as you like — the sheet is matched against whatever is loaded, and only the changes that can touch these products are put in front of you.
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
                  {appliedTo(s.name) > 0
                    ? <span className="ml-2 rounded-full bg-[var(--violet)] px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">{appliedTo(s.name)} cells changed</span>
                    : <span className="ml-2 text-[11px] text-[var(--ink-soft)]">unchanged</span>}
                  <span className="ml-2 text-xs text-[var(--ink-soft)]">{s.products} products · {s.variantRows} rows · {s.types.slice(0, 4).join(", ") || s.vendors.slice(0, 4).join(", ")}{s.types.length > 4 ? ` +${s.types.length - 4}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={appliedTo(s.name) > 0 ? "primary" : undefined} onClick={() => setSaved(download(s))}>Download</Button>
                  <Button size="sm" variant="danger" onClick={() => { setSheets((x) => x.filter((y) => y.name !== s.name)); setPreview(null); setRows([]); setSheetNote(null); }}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved {saved}. Import each in Shopify admin → Products → Import, and tick <strong>Overwrite existing products</strong> so the changes apply.</Alert>}

      {sheets.length > 0 && (
        <Card
          title="The buyer's sheet"
          actions={allReady.length > 0
            ? <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => applyRows(allReady.map((r) => r.id), `Everything that matched — ${allReady.length} change${allReady.length === 1 ? "" : "s"}`)}>Apply all {allReady.length}</Button>
            : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">Have the changes written down?</span>
              <span className="ml-2 text-xs text-[var(--ink-soft)]">The shop&rsquo;s sale template as a spreadsheet, or a PDF or photo of a written page. A template is read column by column and exactly — no interpreting. Either way it is matched against the files above, grouped by shelf, and you approve a shelf at a time.</span>
            </div>
            <Button size="sm" disabled={busy !== null} onClick={() => sheetRef.current?.click()}>{busy === "sheet" ? "Reading…" : rows.length > 0 ? "Use a different sheet" : "Add the sale sheet"}</Button>
            <input ref={sheetRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.txt,.md,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeSheet(f); e.target.value = ""; }} />
          </div>

          {busy === "sheet" && progress && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line-soft)]"><div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--violet)]" /></div>
              <p className="mt-1.5 text-xs text-[var(--ink-soft)]">{progress}</p>
            </div>
          )}

          {sheetNote && (
            <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--rubin-tint)] px-3 py-2 text-xs text-[var(--ink-soft)]">
              <strong>{sheetNote.source}</strong>
              {rows.length > 0 && (
                <span> — {relevant.length} of {rows.length} change{rows.length === 1 ? "" : "s"} can touch the loaded files, across {groups.length} group{groups.length === 1 ? "" : "s"}. {stillToDo.length} still to do.</span>
              )}
              {sheetNote.ignored.length > 0 && (
                <div className="mt-1.5">
                  <strong>Left alone ({sheetNote.ignored.length})</strong> — a heading, or a row with no year tag stated. Nothing here was changed:
                  <ul className="mt-1 list-disc pl-5">{sheetNote.ignored.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              )}
              {sheetNote.unclear && <span className="mt-1 block text-amber-800">Could not turn into a change: {sheetNote.unclear}</span>}
            </div>
          )}

          {groups.map((g) => {
            const ready = readyIn(g.rows);
            const groupChanges = ready.reduce((n, r) => n + countChanges(r.results), 0);
            return (
              <div key={g.name} className="mt-4 rounded-xl border border-[var(--line)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line-soft)] px-3 py-2">
                  <div>
                    <span className="font-semibold">{g.name}</span>
                    <span className="ml-2 text-xs text-[var(--ink-soft)]">
                      {g.rows.length} change{g.rows.length === 1 ? "" : "s"}
                      {groupChanges > 0 && <> · <strong className="tabular-nums">{groupChanges}</strong> cell{groupChanges === 1 ? "" : "s"} would change</>}
                    </span>
                  </div>
                  <Button size="sm" variant="primary" disabled={busy !== null || ready.length === 0} onClick={() => applyRows(ready.map((r) => r.id), g.name)}>
                    {ready.length === 0 ? "Nothing to apply" : `Apply ${ready.length === g.rows.length ? "this group" : `${ready.length} of ${g.rows.length}`}`}
                  </Button>
                </div>
                <ul className="divide-y divide-[var(--line-soft)]">
                  {g.rows.map((r) => {
                    const changes = countChanges(r.results);
                    const matched = countMatched(r.results);
                    const whole = r.plan !== null && isWholeFile(r.plan.scope);
                    const didRefuse = r.results.some((x) => x.result.refused);
                    return (
                      <li key={r.id} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button type="button" className="flex-1 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            <span className={cx("font-medium", r.state !== "ready" && "text-[var(--ink-soft)] line-through")}>{r.instruction}</span>
                            <span className="ml-2 text-xs text-[var(--ink-soft)]">
                              {r.state === "applied" ? "applied"
                                : r.state === "skipped" ? "skipped"
                                : r.failed ? r.failed
                                : r.blocked.length ? "not applied — would change more than it asks"
                                : didRefuse ? "stopped by the safety check"
                                : changes > 0 ? `${matched} product${matched === 1 ? "" : "s"} · ${changes} cell${changes === 1 ? "" : "s"}`
                                : "already done"}
                            </span>
                          </button>
                          {r.state === "ready" && <Button size="sm" onClick={() => setRowState(r.id, "skipped")}>Skip</Button>}
                          {r.state === "skipped" && <Button size="sm" onClick={() => setRowState(r.id, "ready")}>Put back</Button>}
                        </div>

                        {r.blocked.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-red-700">{r.blocked.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                        {whole && r.state === "ready" && r.blocked.length === 0 && (
                          <label className="mt-1 flex items-center gap-2 text-xs font-medium text-red-700">
                            <input type="checkbox" checked={confirmedWhole.includes(r.id)} onChange={(e) => setConfirmedWhole((c) => (e.target.checked ? [...c, r.id] : c.filter((x) => x !== r.id)))} />
                            Nothing narrows this one — it would change every product in every file. Tick to include it.
                          </label>
                        )}
                        {open === r.id && (
                          <div className="mt-2 rounded-lg bg-[var(--rubin-tint)] px-3 py-2 text-xs">
                            {r.understood && <div className="font-medium">{r.understood}</div>}
                            <ul className="mt-1 list-disc pl-5 text-[var(--ink-soft)]">{r.described.map((line, i) => <li key={i}>{line}</li>)}</ul>
                            {r.unclear && <div className="mt-1 text-amber-800">Not sure about: {r.unclear}</div>}
                            {changes > 0 && (
                              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-[var(--ink-soft)]">
                                {r.results.flatMap((x) => x.result.changes.slice(0, 5).map((c, i) => (
                                  <li key={`${x.name}-${i}`}>{c.handle} · {c.column}: {c.before || "—"} → <span className="text-[var(--ink)]">{c.after || "—"}</span></li>
                                ))).slice(0, 8)}
                                {changes > 8 && <li>…and {changes - 8} more</li>}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {changesSoFar > 0 && (
            <div className="mt-4 rounded-xl border-2 border-[var(--violet)] bg-[var(--rubin-tint)] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-semibold">Ready to import — <span className="tabular-nums">{changesSoFar}</span> cell{changesSoFar === 1 ? "" : "s"} changed across {edited.length} file{edited.length === 1 ? "" : "s"}.</div>
                  <div className="mt-0.5 text-xs text-[var(--ink-soft)]">Only the files something was written into are listed. The rest are still the ones you loaded, so there is nothing to re-import for them.</div>
                </div>
                <Button variant="primary" onClick={downloadAll}>Download {edited.length === 1 ? "it" : `all ${edited.length}`}</Button>
              </div>
              <ul className="mt-2 divide-y divide-[var(--line-soft)] text-sm">
                {edited.map((s) => (
                  <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>{s.name.replace(/\.csv$/i, "")}<span className="ml-2 text-xs text-[var(--ink-soft)] tabular-nums">{appliedTo(s.name)} cells</span></span>
                    <Button size="sm" onClick={() => setSaved(download(s))}>Download this one</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {setAside.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] px-3 py-2.5 text-xs text-[var(--ink-soft)]">
              <strong>Not for these files ({setAside.length})</strong> — nothing loaded could match {setAside.length === 1 ? "it" : "them"}. Load the export {setAside.length === 1 ? "it is" : "they are"} about and read the sheet again to bring {setAside.length === 1 ? "it" : "them"} back.
              <ul className="mt-1 list-disc pl-5">
                {setAside.map((r) => <li key={r.id}>{r.instruction}{r.why ? <span className="italic"> — {r.why}</span> : null}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {sheets.length > 0 && (
        <Card title="One change, in your own words" actions={feed.length > 0 ? <Button size="sm" onClick={undo}>Undo last</Button> : undefined}>
          {feed.length > 0 && (
            <ol className="mb-4 space-y-2">
              {feed.map((f, i) => (
                <li key={i} className="rounded-lg border border-[var(--line-soft)] bg-[var(--rubin-tint)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{i + 1}. {f.title}</span>
                    <span className="text-xs text-[var(--ink-soft)]">{f.steps} change{f.steps === 1 ? "" : "s"} · {f.changes} cell{f.changes === 1 ? "" : "s"}</span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-[var(--ink-soft)]">
                    {f.lines.slice(0, 6).map((line, j) => <li key={j}>{line}</li>)}
                    {f.lines.length > 6 && <li>…and {f.lines.length - 6} more</li>}
                  </ul>
                  {sheets.length > 1 && <div className="mt-1 text-[11px] text-[var(--ink-soft)]">{f.perFile.filter((p) => p.changes > 0).map((p) => `${p.name}: ${p.changes}`).join(" · ") || "no file changed"}</div>}
                </li>
              ))}
            </ol>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--ink-2)]">{feed.length > 0 ? "And then…" : "Say it the way you would say it to someone"}</span>
            <textarea rows={2} value={instruction} onChange={(e) => { setInstruction(e.target.value); setPreview(null); }} className={INPUT} placeholder="Put all the Karbon jackets 30% off and into clearance" />
            <span className="mt-1 block text-xs text-[var(--ink-soft)]">Each one applies on top of the last, across every file, and any of them can be undone.</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!aiEnabled || busy !== null || !instruction.trim()} onClick={() => void workOut()}>
              {busy === "planning" ? "Working it out…" : "Work out what would change"}
            </Button>
          </div>

          {feed.length > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-soft)]">
              <strong className="tabular-nums">{changesSoFar}</strong> cell{changesSoFar === 1 ? "" : "s"} changed so far across {sheets.length} file{sheets.length === 1 ? "" : "s"}. The download buttons above give you the files as they stand.
            </p>
          )}
        </Card>
      )}

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
              <p className="mt-2 text-sm">Either the products it names are in an export that is not loaded, or the shop spells that brand or category differently. Load the missing export, or do this one by hand.</p>
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
                  <div className="mt-3"><Button onClick={() => setPreview(null)}>Discard</Button></div>
                </Alert>
              ) : (
                <>
                  <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-[var(--line-soft)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--rubin-tint)] text-left">
                        <tr>
                          {sheets.length > 1 && <th className="px-2.5 py-1.5 font-medium">File</th>}
                          <th className="px-2.5 py-1.5 font-medium">Product</th>
                          <th className="px-2.5 py-1.5 font-medium">Column</th>
                          <th className="px-2.5 py-1.5 font-medium">Now</th>
                          <th className="px-2.5 py-1.5 font-medium">After</th>
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
