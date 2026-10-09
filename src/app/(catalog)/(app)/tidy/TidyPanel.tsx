"use client";

import { useRef, useState } from "react";
import { transcribeDocumentAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, INPUT, cx } from "@/app/(catalog)/ui";
import { fitsUpload, shrinkImage, tooBig } from "@/app/(catalog)/shrink";
import { CSV_COLUMNS, brandOf, csvNameFor, transcriptToCsv, unitCostOf, type Transcript, type TranscriptRow } from "@/lib/catalog/extract/transcribe";

/**
 * The table a scribbled-on page becomes, for checking before it goes anywhere.
 *
 * Every cell is a box: the reader's work is a first draft of what a person would have typed, and
 * the person finishes it here rather than in a spreadsheet afterwards. A reading the reader was
 * not sure of is marked, with the other way it could go, so the doubt is seen and not found later
 * on a price tag.
 */

const read = (file: File | Blob, name = "that file") => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
  r.onerror = () => reject(new Error(`Could not read ${name}`));
  r.readAsDataURL(file);
});

const blank = (): TranscriptRow => ({ sku: "", bindingSku: "", description: "", colour: "", size: "", quantity: null, unitPrice: null, bindingUnitPrice: null, discountPercent: null, rrp: null, season: "", gender: "", notes: "", unsure: [] });

type NumberKey = "quantity" | "unitPrice" | "bindingUnitPrice" | "discountPercent" | "rrp";
type TextKey = "sku" | "bindingSku" | "description" | "colour" | "size" | "season" | "gender" | "notes";

const COLUMNS: Array<{ key: TextKey | NumberKey; label: string; width: string; number?: boolean }> = [
  { key: "sku", label: "SKU", width: "w-24" },
  { key: "bindingSku", label: "Binding SKU", width: "w-24" },
  { key: "description", label: "Description", width: "min-w-[18rem]" },
  { key: "colour", label: "Colour", width: "w-20" },
  { key: "size", label: "Size", width: "w-16" },
  { key: "quantity", label: "Qty", width: "w-14", number: true },
  { key: "unitPrice", label: "Unit price", width: "w-24", number: true },
  { key: "bindingUnitPrice", label: "Binding price", width: "w-24", number: true },
  { key: "discountPercent", label: "Disc %", width: "w-16", number: true },
  { key: "rrp", label: "RRP", width: "w-24", number: true },
  { key: "season", label: "Season", width: "w-16" },
  { key: "gender", label: "Gender", width: "w-20" },
  { key: "notes", label: "Notes", width: "min-w-[14rem]" },
];

export function TidyPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [brand, setBrand] = useState("");

  async function readDocument() {
    if (files.length === 0) return;
    setBusy(true); setError(null); setTranscript(null);
    try {
      const sent: Array<{ name: string; type: string; base64: string }> = [];
      for (const file of files) {
        setProgress(`Preparing ${file.name}…`);
        const small = await shrinkImage(file);
        if (!fitsUpload(small.file.size)) { setError(tooBig(file, small.file.size)); return; }
        sent.push({ name: file.name, type: small.file.type || file.type, base64: await read(small.file, file.name) });
      }
      setProgress(files.length === 1 ? "Reading the page — print and pen…" : `Reading ${files.length} pages — print and pen…`);
      const r = await transcribeDocumentAction({ files: sent, hint });
      if (!r.ok) { setError(r.error); return; }
      setTranscript(r.data!);
      setBrand(brandOf(r.data!.supplier));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false); setProgress("");
    }
  }

  function update(i: number, key: TextKey | NumberKey, value: string) {
    setTranscript((t) => {
      if (!t) return t;
      const rows = t.rows.map((row, k) => {
        if (k !== i) return row;
        if (COLUMNS.find((c) => c.key === key)?.number) {
          const n = value.trim() === "" ? null : Number(value.replace(/[$,\s]/g, ""));
          return { ...row, [key]: n === null || Number.isFinite(n) ? n : row[key as NumberKey] };
        }
        return { ...row, [key]: value };
      });
      return { ...t, rows };
    });
  }

  function download() {
    if (!transcript) return;
    const csv = transcriptToCsv(transcript, brand.trim() || brandOf(transcript.supplier));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = csvNameFor(transcript);
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const doubts = transcript?.rows.reduce((n, r) => n + r.unsure.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      {!aiEnabled && <Alert tone="warning">No API key is set, so a document cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>}
      <Card title="The document">
        <p className="mb-3 text-xs text-[var(--ink-soft)]">
          A photo or a scan: JPEG, PNG, an iPhone HEIC, or a PDF. Several photos are the pages of one document and are read together. The pen counts: a price in the margin is read as the recommended retail, a percentage as the discount, a year as the season, and everything else written against a line is kept as a note on it. A ski with its binding bracketed beneath it comes out as one package.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>{files.length > 0 ? "Choose different pages" : "Choose the photo or PDF"}</Button>
          <input ref={fileRef} type="file" multiple accept="image/*,.heic,.heif,.pdf,application/pdf" className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          {files.length > 0 && <span className="text-sm text-[var(--ink-soft)]">{files.map((f) => f.name).join(", ")}</span>}
        </div>
        <label className="mt-3 block text-xs font-medium text-[var(--ink-soft)]" htmlFor="tidy-hint">What the handwriting means, if it needs saying</label>
        <input id="tidy-hint" className={cx(INPUT, "mt-1")} value={hint} disabled={busy} onChange={(e) => setHint(e.target.value)} placeholder="e.g. the red numbers are the package RRPs; 2998 means closeout; the right-hand column is our cost after freight" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={busy || files.length === 0 || !aiEnabled} onClick={() => void readDocument()}>{busy ? progress || "Reading…" : "Read it into a table"}</Button>
          {busy && <span className="text-xs text-[var(--ink-soft)]">A page takes a minute or two.</span>}
        </div>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
      </Card>

      {transcript && (
        <Card
          title={<>{transcript.supplier || "Document"}{transcript.reference ? <span className="font-normal text-[var(--ink-soft)]"> · {transcript.reference}</span> : ""}{transcript.date ? <span className="font-normal text-[var(--ink-soft)]"> · {transcript.date}</span> : ""}</>}
          actions={<>
            <Button size="sm" onClick={() => setTranscript((t) => (t ? { ...t, rows: [...t.rows, blank()] } : t))}>Add a row</Button>
            <Button size="sm" variant="primary" onClick={download}>Download the CSV</Button>
          </>}
        >
          {transcript.remarks && <p className="mb-2 text-sm"><span className="font-medium">Written on the page:</span> {transcript.remarks}</p>}
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">Brand <input className={cx(INPUT, "w-40")} value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
            <span className="text-xs text-[var(--ink-soft)]">{transcript.rows.length} row{transcript.rows.length === 1 ? "" : "s"}{doubts > 0 ? ` · ${doubts} reading${doubts === 1 ? "" : "s"} to check, marked in amber` : ""}. Every cell can be edited; the unit cost is worked out as the prices less the discount.</span>
          </div>
          <div className="overflow-auto rounded-lg border border-[var(--line-soft)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--rubin-tint)] text-left">
                <tr>
                  {COLUMNS.map((c) => <th key={c.key} className="whitespace-nowrap px-2 py-1.5 font-medium">{c.label}</th>)}
                  <th className="px-2 py-1.5 font-medium">Unit cost</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {transcript.rows.map((row, i) => {
                  const doubted = new Set(row.unsure.map((u) => u.split(":")[0].trim()));
                  return (
                    <tr key={i} className="border-t border-[var(--line-soft)] align-top">
                      {COLUMNS.map((c) => {
                        const v = row[c.key];
                        const text = v === null || v === undefined ? "" : String(v);
                        const flagged = doubted.has(c.key);
                        return (
                          <td key={c.key} className="px-1 py-1">
                            <input
                              value={text}
                              onChange={(e) => update(i, c.key, e.target.value)}
                              title={flagged ? row.unsure.filter((u) => u.startsWith(c.key)).join("; ") : undefined}
                              className={cx("rounded border px-1.5 py-1 text-xs outline-none focus:border-[var(--violet)]", c.width, flagged ? "border-amber-400 bg-amber-50" : "border-[var(--line-soft)] bg-white")}
                            />
                            {flagged && <div className="mt-0.5 text-[10px] text-amber-800">{row.unsure.filter((u) => u.startsWith(c.key)).map((u) => u.replace(/^[a-zA-Z]+:\s*/, "")).join("; ")}</div>}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums">{(() => { const c = unitCostOf(row); return c === null ? "" : c.toFixed(2); })()}</td>
                      <td className="px-1 py-1"><Button size="sm" onClick={() => setTranscript((t) => (t ? { ...t, rows: t.rows.filter((_, k) => k !== i) } : t))}>Remove</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">The CSV has these columns: {CSV_COLUMNS.join(", ")}. On Bulk uploads, load your export, then add this CSV with &ldquo;Add the invoice&rdquo;.</p>
        </Card>
      )}
    </div>
  );
}
