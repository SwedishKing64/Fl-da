"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, cx } from "@/app/(catalog)/ui";

interface UploadResult { filename: string; rows: number; method: string | null; kind: string; warnings: string[] }
interface AutoResult { applied: boolean; products: number; variants: number }

const KINDS = [
  { value: "AUTO", label: "Let the AI decide", hint: "Invoice, spec sheet, catalogue page or product photo: the file is read and classified for you." },
  { value: "INVOICE", label: "Invoice / order confirmation", hint: "Line items with cost and quantity." },
  { value: "SPEC_SHEET", label: "Spec sheet / catalogue", hint: "Descriptions, specs, sizes and tags are merged into matching products." },
  { value: "PRODUCT_PHOTO", label: "Product photos", hint: "Attached to products by name or SKU in the filename, or via the review grid." },
];

export function UploadPanel({ batchId, aiEnabled, hasProducts, reading }: { batchId: string; aiEnabled: boolean; hasProducts: boolean; reading: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("AUTO");
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [auto, setAuto] = useState<AutoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Files are stored straight away and read afterwards, so the page has to come back and look.
   * Without this an upload would appear to have done nothing at all until something else happened
   * to refresh the page.
   */
  useEffect(() => {
    if (reading === 0) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [reading, router]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setAuto(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("autoMap", hasProducts ? "0" : "1");
    for (const f of list) form.append("files", f);
    try {
      const res = await fetch(`/api/catalog/batches/${batchId}/upload`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }));
      if (!res.ok) throw new Error(body.error ?? `Upload failed (HTTP ${res.status})`);
      setResults(body.results);
      setAuto(body.auto ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const chosen = KINDS.find((k) => k.value === kind)!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--ink-soft)]">These files are:</span>
        {KINDS.map((k) => (
          <button key={k.value} type="button" onClick={() => setKind(k.value)} className={cx("rounded-full border px-3 py-1 text-xs", kind === k.value ? "border-[var(--violet)] bg-[var(--violet-soft)] text-[var(--violet)]" : "border-[var(--line)] bg-white")}>{k.label}</button>
        ))}
      </div>
      <div
        className={cx("dropzone", active && "active")}
        onDragOver={(e) => { e.preventDefault(); setActive(true); }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => { e.preventDefault(); setActive(false); void upload(e.dataTransfer.files); }}
      >
        <div className="text-sm font-medium text-[var(--ink)]">{busy ? "Uploading and reading…" : "Drop files here, or choose files"}</div>
        <div className="mt-1 text-xs">{chosen.hint}</div>
        <div className="mt-1 text-xs">PDF, XLSX, CSV, TXT, JPG or PNG. {aiEnabled ? "PDFs, scans and photos are read by AI." : "ANTHROPIC_API_KEY is not set: only CSV/XLSX and text-based PDFs can be read."}</div>
        <div className="mt-3">
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Choose files</Button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xlsm,.xls,.csv,.txt,image/*" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {reading > 0 && (
        <Alert tone="info">
          Reading {reading === 1 ? "the file" : `${reading} files`} now. A scanned or photographed invoice takes a minute or two — this page updates itself as each one is read, and you can leave it and come back.
        </Alert>
      )}

      {results && (
        <Alert tone={results.every((r) => r.rows > 0 || r.kind === "PRODUCT_PHOTO") ? "success" : "warning"}>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={`${r.filename}-${i}`}><strong>{r.filename}</strong>: {r.kind === "PRODUCT_PHOTO" ? "product photo" : `${r.rows} rows`}{r.method ? ` via ${r.method.replace("_", " ").toLowerCase()}` : ""}{r.kind && r.kind !== "PRODUCT_PHOTO" && r.kind !== "AUTO" ? ` (${r.kind.replace("_", " ").toLowerCase()})` : ""}{r.warnings.length ? ` — ${r.warnings.join(" ")}` : ""}</li>
            ))}
          </ul>
          {auto && !auto.applied && results.some((r) => r.rows > 0) && <div className="mt-2 text-xs">Some columns were not recognised automatically. Use <strong>Map columns</strong> to confirm them once; the layout is remembered for this supplier.</div>}
        </Alert>
      )}
    </div>
  );
}
