"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildProductsAction, deleteBatchAction, deleteSourceFileAction, retryExtractionAction } from "@/app/(catalog)/actions";
import { useState } from "react";
import { Button } from "@/app/(catalog)/ui";

/** What a request that threw — cut off by the host, the connection dropping — can be said as. */
const said = (err: unknown): string => {
  const m = err instanceof Error ? err.message : String(err);
  return /timed? ?out|504|gateway|fetch failed|failed to fetch|unexpected response/i.test(m)
    ? "The request was cut off before it answered — the host gives it five minutes. Whatever it had done is saved; press again to carry on."
    : m;
};

export function DeleteFileButton({ fileId }: { fileId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove this file from the batch?")) start(async () => { try { await deleteSourceFileAction(fileId); } catch (err) { alert(said(err)); } router.refresh(); }); }}>Remove</Button>
  );
}

export function DeleteBatchButton({ batchId, disabled }: { batchId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="danger" disabled={disabled || pending} onClick={() => { if (confirm("Delete this batch and everything in it? Exported CSV files are removed too.")) start(async () => { try { const r = await deleteBatchAction(batchId); if (!r.ok) alert(r.error); } catch (err) { alert(said(err)); } }); }}>Delete</Button>
  );
}

/** Read a stored file again, for one whose first reading ran out of time. */
export function RetryExtractionButton({ fileId }: { fileId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        title="The file is stored; this reads it again"
        onClick={() => start(async () => {
          setError(null);
          // Said here, never thrown: a read the host cut off used to take the whole page down.
          try { const r = await retryExtractionAction(fileId); if (!r.ok) setError(r.error); } catch (err) { setError(said(err)); }
          router.refresh();
        })}
      >
        {pending ? "Reading…" : "Read again"}
      </Button>
      {error && <span className="max-w-xs text-right text-xs text-red-700">{error}</span>}
    </span>
  );
}

/** The way on from the upload page when nothing has been built yet — and why, if nothing can be. */
export function BuildProductsButton({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="primary" icon="🔨"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          try {
            const r = await buildProductsAction(batchId);
            if (!r.ok) { setError(r.error); return; }
            router.push(`/batches/${batchId}/review`);
          } catch (err) {
            setError(said(err));
          }
        })}
      >
        {pending ? "Building…" : "Build products →"}
      </Button>
      {error && <span className="max-w-sm text-right text-xs text-red-700">{error}</span>}
    </span>
  );
}
