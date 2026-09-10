"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, cx } from "@/app/catalog/ui";

interface UploadResult { filename: string; rows: number; method: string | null; warnings: string[] }

export function UploadPanel({ batchId, aiEnabled }: { batchId: string; aiEnabled: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("INVOICE");
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("kind", kind);
    for (const f of list) form.append("files", f);
    try {
      const res = await fetch(`/api/catalog/batches/${batchId}/upload`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setResults(body.results);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={cx("dropzone", active && "active")}
        onDragOver={(e) => { e.preventDefault(); setActive(true); }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => { e.preventDefault(); setActive(false); void upload(e.dataTransfer.files); }}
      >
        <div className="text-sm font-medium text-[var(--ink)]">{busy ? "Uploading and extracting…" : "Drop invoices, order confirmations or spec sheets here"}</div>
        <div className="mt-1 text-xs">PDF, XLSX, CSV, TXT or photos (JPG/PNG). {aiEnabled ? "PDFs and images are read with AI." : "Set ANTHROPIC_API_KEY to read PDFs/images with AI; CSV/XLSX work without it."}</div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs">
            <option value="INVOICE">Invoice / order confirmation</option>
            <option value="SPEC_SHEET">Spec sheet</option>
          </select>
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Choose files</Button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xlsm,.xls,.csv,.txt,image/*" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {results && (
        <Alert tone={results.every((r) => r.rows > 0) ? "success" : "warning"}>
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.filename}><strong>{r.filename}</strong>: {r.rows} rows{r.method ? ` via ${r.method.replace("_", " ").toLowerCase()}` : ""}{r.warnings.length ? ` — ${r.warnings.join(" ")}` : ""}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
