"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBatchAction, deleteSourceFileAction } from "@/app/(catalog)/actions";
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
