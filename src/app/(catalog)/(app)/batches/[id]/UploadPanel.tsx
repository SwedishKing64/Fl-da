"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, LinkButton, cx } from "@/app/(catalog)/ui";
import { readingCountAction } from "@/app/(catalog)/actions";

interface UploadResult { filename: string; rows: number; method: string | null; kind: string; warnings: string[] }
interface AutoResult { applied: boolean; products: number; variants: number }

const KINDS = [
  { value: "AUTO", label: "Let the AI decide", hint: "Invoice, spec sheet, catalogue page or product photo: the file is read and classified for you." },
  { value: "INVOICE", label: "Invoice / order confirmation", hint: "Line items with cost and quantity." },
  { value: "SPEC_SHEET", label: "Spec sheet / catalogue", hint: "Descriptions, specs, sizes and tags are merged into matching products." },
  { value: "PRODUCT_PHOTO", label: "Product photos", hint: "Attached to products by name or SKU in the filename, or via the review grid." },
];

export function UploadPanel({ batchId, aiEnabled, hasProducts, reading, productCount }: { batchId: string; aiEnabled: boolean; hasProducts: boolean; reading: number; productCount: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  // null while nothing is in flight; 0-100 as the bytes go up; 100 once the server has them and is
  // storing them. A bar that only ever sat at "Uploading…" is why a slow phone photo looked stuck.
  const [progress, setProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(0);
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
    let stop = false;
    // Ask the cheap question — how many are left — and only re-render the page when the answer
    // changes. Refreshing on a timer re-ran every query behind this page every few seconds, which
    // is what made waiting for a scan feel like the whole app had bogged down.
    const tick = async () => {
      if (stop) return;
      try {
        const left = await readingCountAction(batchId);
        if (!stop && left !== reading) router.refresh();
      } catch {
        // A failed poll is not worth reporting; the next one will do.
      }
    };
    const timer = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [reading, batchId, router]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setAuto(null);
    setProgress(0);
    setSending(list.reduce((n, f) => n + f.size, 0));
    const form = new FormData();
    form.set("kind", kind);
    form.set("autoMap", hasProducts ? "0" : "1");
    for (const f of list) form.append("files", f);
    try {
      // XHR rather than fetch: fetch reports nothing at all about how far a request body has got,
      // and on a phone photo over a slow connection that silence is most of the wait.
      const body = await new Promise<{ results?: UploadResult[]; auto?: AutoResult; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/catalog/batches/${batchId}/upload`);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        // The bytes are up; what is left is the server storing them, which has no progress to report.
        xhr.upload.onload = () => setProgress(100);
        xhr.onload = () => {
          let parsed: { results?: UploadResult[]; auto?: AutoResult; error?: string };
          try { parsed = JSON.parse(xhr.responseText); } catch { parsed = { error: `Upload failed (HTTP ${xhr.status})` }; }
          if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
          else reject(new Error(parsed.error ?? `Upload failed (HTTP ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("The connection dropped before the files finished uploading."));
        xhr.ontimeout = () => reject(new Error("The upload timed out."));
        xhr.send(form);
      });
      setResults(body.results ?? []);
      setAuto(body.auto ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

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
        {progress !== null && (
          <div className="mx-auto mt-4 w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
              <div className="rubin-gradient h-full rounded-full transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--ink-soft)]">
              <span>{progress < 100 ? `Uploading ${mb(sending)}` : "Uploaded — saving the files"}</span>
              <span className="tabular-nums font-medium">{progress}%</span>
            </div>
          </div>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {reading > 0 && (
        <Alert tone="info">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />
            <span>Reading {reading === 1 ? "the file" : `${reading} files`} now, then building the products — columns are matched for you. A scanned or photographed invoice takes a minute or two. This page updates itself as each one is read, and you can leave it and come back.</span>
          </div>
        </Alert>
      )}

      {/* The way on. Without it the only route to the grid was the step bar, which reads as a
          position indicator rather than something to click. */}
      {productCount > 0 && reading === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--rubin-tint)] px-4 py-3">
          <div className="text-sm">
            <div className="font-semibold">{productCount} product{productCount === 1 ? "" : "s"} built from these files.</div>
            <div className="text-xs text-[var(--ink-soft)]">Prices, tags and descriptions are all editable in the grid.</div>
          </div>
          <LinkButton href={`/batches/${batchId}/review`} variant="primary">Next: Review &amp; price →</LinkButton>
        </div>
      )}

      {results && (
        <Alert tone={results.every((r) => r.rows > 0 || r.kind === "PRODUCT_PHOTO") ? "success" : "warning"}>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={`${r.filename}-${i}`}><strong>{r.filename}</strong>: {r.kind === "PRODUCT_PHOTO" ? "product photo" : `${r.rows} rows`}{r.method ? ` via ${r.method.replace("_", " ").toLowerCase()}` : ""}{r.kind && r.kind !== "PRODUCT_PHOTO" && r.kind !== "AUTO" ? ` (${r.kind.replace("_", " ").toLowerCase()})` : ""}{r.warnings.length ? ` — ${r.warnings.join(" ")}` : ""}</li>
            ))}
          </ul>
          {auto && !auto.applied && results.some((r) => r.rows > 0) && <div className="mt-2 text-xs">Some columns were not recognised. Everything that could be built has been; <a href={`/batches/${batchId}/map`} className="font-semibold underline">set the rest by hand</a> and it is remembered for this supplier.</div>}
        </Alert>
      )}
    </div>
  );
}
