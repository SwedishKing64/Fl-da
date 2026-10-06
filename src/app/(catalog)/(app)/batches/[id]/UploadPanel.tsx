"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, LinkButton, cx } from "@/app/(catalog)/ui";
import { buildProductsAction, readingCountAction, retryExtractionAction } from "@/app/(catalog)/actions";
import { fitsUpload, shrinkAll, tooBig } from "@/app/(catalog)/shrink";

interface UploadResult { filename: string; rows: number; method: string | null; kind: string; warnings: string[] }
interface AutoResult { applied: boolean; products: number; variants: number }

const KINDS = [
  { value: "AUTO", label: "Work it out", hint: "A spreadsheet is judged by its columns — one with prices and quantities is an order, one without is a reference sheet. A PDF or a photo is read and classified." },
  { value: "INVOICE", label: "Invoice / order confirmation", hint: "What was bought: line items with a cost or a quantity. These become the products." },
  { value: "SPEC_SHEET", label: "Barcodes, specs or descriptions", hint: "Looked up against the products the order built — barcodes by SKU, specs and descriptions by model code. Adds no products of its own." },
  { value: "PRODUCT_PHOTO", label: "Product photos", hint: "Attached to products by name or SKU in the filename, or via the review grid." },
];

/** A read still marked as running this long after the upload is one the host cut off. Matches the page. */
const STALL_MS = 330_000;

/** How many times a read that ran out of time is tried again before it is left to the person. */
const RETRIES = 2;

export function UploadPanel({ batchId, aiEnabled, reading, productCount, pendingSince = [], buildNow = false, retryable = [], allNew = false }: { batchId: string; aiEnabled: boolean; hasProducts: boolean; reading: number; productCount: number; pendingSince?: number[]; buildNow?: boolean; retryable?: Array<{ id: string; filename: string }>; allNew?: boolean }) {
  const router = useRouter();
  const [rereading, setRereading] = useState<{ filename: string; attempt: number } | null>(null);
  const attempts = useRef(new Map<string, number>());

  /**
   * A read that ran out of time is tried again from here, without anyone pressing anything: each
   * try is a request with five minutes of its own, and the read stops itself inside that time and
   * says so, so a try never hangs. Twice, then the file says what happened and Read again stays.
   */
  useEffect(() => {
    if (rereading || reading > 0) return;
    const next = retryable.find((f) => (attempts.current.get(f.id) ?? 0) < RETRIES);
    if (!next) return;
    const attempt = (attempts.current.get(next.id) ?? 0) + 1;
    attempts.current.set(next.id, attempt);
    setRereading({ filename: next.filename, attempt });
    void (async () => {
      try { await retryExtractionAction(next.id); } catch { /* the row says what happened */ }
      setRereading(null);
      router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryable, reading, rereading]);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  /** Whether this page has been told to build once the reading is done — by the upload, or by the server. */
  const buildAfter = useRef(false);
  const built = useRef(false);

  /**
   * The products are built from here, not behind the upload: reading a photograph is one long
   * model call and building can be another, and together they outran the time the upload had
   * after it answered — the file sat on "reading…" for ever. This request has its own time.
   */
  const build = async () => {
    if (built.current) return;
    built.current = true;
    setBuilding(true); setBuildError(null);
    try {
      const r = await buildProductsAction(batchId);
      if (!r.ok) setBuildError(r.error);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuilding(false);
      router.refresh();
    }
  };

  useEffect(() => {
    if (reading > 0) return;
    if (buildNow || buildAfter.current) { buildAfter.current = false; void build(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, buildNow]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  // null while nothing is in flight; 0-100 as the bytes go up; 100 once the server has them and is
  // storing them. A bar that only ever sat at "Uploading…" is why a slow phone photo looked stuck.
  const [progress, setProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(0);
  /** What was shrunk on the way out, so a file arriving smaller than it left is not a mystery. */
  const [notes, setNotes] = useState<string[]>([]);
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
      // A read the host cut off never reports back; once one is past its time the page is shown
      // again, and says so on the file.
      if (pendingSince.some((t) => Date.now() - t > STALL_MS)) { router.refresh(); return; }
      try {
        const left = await readingCountAction(batchId);
        if (!stop && left !== reading) router.refresh();
      } catch {
        // A failed poll is not worth reporting; the next one will do.
      }
    };
    const timer = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [reading, batchId, router, pendingSince]);

  async function upload(chosen: FileList | File[]) {
    const picked = Array.from(chosen);
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    setAuto(null);
    setProgress(0);
    setNotes([]);

    /**
     * Shrink a scan or a photo before it goes.
     *
     * An upload body tops out at about 4.5MB on a serverless host, and a scanned A4 invoice at
     * 600dpi is far past that — so it was refused at the edge before any of this app ran, with
     * nothing to show for it but an upload that never finished. Nothing is lost: the reader scales
     * anything over 1568px on its long edge down to 1568px before looking at it, so the extra
     * pixels only ever made the file too big to arrive.
     */
    const { files: list, notes: shrunk } = await shrinkAll(picked);
    setNotes(shrunk);
    const over = list.find((f) => !fitsUpload(f.size));
    if (over) {
      setError(tooBig(over, over.size));
      setBusy(false);
      setProgress(null);
      return;
    }

    setSending(list.reduce((n, f) => n + f.size, 0));
    const form = new FormData();
    form.set("kind", kind);
    // The server decides whether to rebuild: it knows whether the products were edited by hand.
    form.set("autoMap", "1");
    for (const f of list) form.append("files", f);
    try {
      // XHR rather than fetch: fetch reports nothing at all about how far a request body has got,
      // and on a phone photo over a slow connection that silence is most of the wait.
      const body = await new Promise<{ results?: UploadResult[]; auto?: AutoResult; buildAfter?: boolean; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/catalog/batches/${batchId}/upload`);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        // The bytes are up; what is left is the server storing them, which has no progress to report.
        xhr.upload.onload = () => setProgress(100);
        xhr.onload = () => {
          let parsed: { results?: UploadResult[]; auto?: AutoResult; buildAfter?: boolean; error?: string };
          try {
            parsed = JSON.parse(xhr.responseText);
          } catch {
            // 413 never reaches our code: the host refuses the body at the edge and answers with
            // its own page, so there is no JSON and no log line. Say what it actually means.
            parsed = xhr.status === 413
              ? { error: "The upload was refused for being too big before it reached the app. Pictures are shrunk here automatically, so this is either a large PDF — send fewer pages — or several files at once that together come to more than about 4MB. Try them one at a time." }
              : { error: `Upload failed (HTTP ${xhr.status})` };
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
          else reject(new Error(parsed.error ?? `Upload failed (HTTP ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("The connection dropped before the files finished uploading."));
        xhr.ontimeout = () => reject(new Error("The upload timed out."));
        xhr.send(form);
      });
      setResults(body.results ?? []);
      setAuto(body.auto ?? null);
      if (body.buildAfter) { buildAfter.current = true; built.current = false; }
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
        <div className="mt-1 text-xs">PDF, XLSX, CSV, TXT, JPG or PNG. {aiEnabled ? "PDFs, scans and photos are read by AI. A scan or photo is shrunk here before it is sent — it is read at 1568px across whatever you give it, so there is no need to scan above 300dpi." : "ANTHROPIC_API_KEY is not set: only CSV/XLSX and text-based PDFs can be read."}</div>
        <div className="mt-3">
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Choose files</Button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xlsm,.xls,.csv,.txt,image/*" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
        {notes.length > 0 && (
          <ul className="mx-auto mt-3 max-w-md list-none text-left text-[11px] text-[var(--ink-soft)]">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
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
            <span>Reading {reading === 1 ? "the file" : `${reading} files`} now — columns are matched for you. A spreadsheet takes seconds; a scanned or photographed invoice is read by the model and usually takes under a minute. This page updates itself as each one is read, and then builds the products.</span>
          </div>
        </Alert>
      )}
      {rereading && (
        <Alert tone="info">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />
            <span>The read of {rereading.filename} ran out of time, so it is being read again (try {rereading.attempt + 1} of {RETRIES + 1}) — a photograph is read at the model&apos;s fast speed and stops itself in time rather than hanging.</span>
          </div>
        </Alert>
      )}
      {building && (
        <Alert tone="info">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />
            <span>{allNew ? "Files read. Building the products as new — named, tagged and priced the way the shop lists this brand. Usually seconds." : "Files read. Building the products — matched against what the shop already sells, named and tagged the way it lists them. Usually seconds; longer when lines have to be put to the model to place. If everything here is new, tick All new products above and that match is skipped."}</span>
          </div>
        </Alert>
      )}
      {buildError && <Alert tone="danger">{buildError}</Alert>}

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
        <Alert tone={results.some((r) => r.warnings.length > 0 && r.rows === 0 && r.method === null) ? "warning" : results.every((r) => r.rows > 0 || r.method === null || r.kind === "PRODUCT_PHOTO") ? "success" : "warning"}>
          <ul className="space-y-1">
            {results.map((r, i) => {
              // A file just stored has not been read yet — that happens in the background, after this
              // answer — so its row count here is always 0. Saying "0 rows" told people the file was
              // empty when it had 30; the real counts are in the table below once it is read.
              const stored = r.method === null && r.rows === 0 && r.warnings.length === 0 && r.kind !== "PRODUCT_PHOTO";
              return (
                <li key={`${r.filename}-${i}`}><strong>{r.filename}</strong>: {stored ? "uploaded — being read, the table below shows what was found" : <>{r.kind === "PRODUCT_PHOTO" ? "product photo" : `${r.rows} rows`}{r.method ? ` via ${r.method.replace("_", " ").toLowerCase()}` : ""}{r.kind && r.kind !== "PRODUCT_PHOTO" && r.kind !== "AUTO" ? ` (${r.kind.replace("_", " ").toLowerCase()})` : ""}{r.warnings.length ? ` — ${r.warnings.join(" ")}` : ""}</>}</li>
              );
            })}
          </ul>
          {auto && !auto.applied && results.some((r) => r.rows > 0) && <div className="mt-2 text-xs">Some columns were not recognised. Everything that could be built has been; <a href={`/batches/${batchId}/map`} className="font-semibold underline">set the rest by hand</a> and it is remembered for this supplier.</div>}
        </Alert>
      )}
    </div>
  );
}
