"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildProductsAction, deleteBatchAction, deleteSourceFileAction, retryExtractionAction } from "@/app/(catalog)/actions";
import { useState } from "react";
import { Button } from "@/app/(catalog)/ui";

export function DeleteFileButton({ fileId }: { fileId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove this file from the batch?")) start(async () => { await deleteSourceFileAction(fileId); router.refresh(); }); }}>Remove</Button>
  );
}

export function DeleteBatchButton({ batchId, disabled }: { batchId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="danger" disabled={disabled || pending} onClick={() => { if (confirm("Delete this batch and everything in it? Exported CSV files are removed too.")) start(async () => { const r = await deleteBatchAction(batchId); if (!r.ok) alert(r.error); }); }}>Delete</Button>
  );
}

/** Read a stored file again, for one whose first reading ran out of time. */
export function RetryExtractionButton({ fileId }: { fileId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      disabled={pending}
      title="The file is stored; this reads it again"
      onClick={() => start(async () => { await retryExtractionAction(fileId); router.refresh(); })}
    >
      {pending ? "Reading…" : "Read again"}
    </Button>
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
        variant="primary"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const r = await buildProductsAction(batchId);
          if (!r.ok) { setError(r.error); return; }
          router.push(`/batches/${batchId}/review`);
        })}
      >
        {pending ? "Building…" : "Build products →"}
      </Button>
      {error && <span className="max-w-sm text-right text-xs text-red-700">{error}</span>}
    </span>
  );
}
