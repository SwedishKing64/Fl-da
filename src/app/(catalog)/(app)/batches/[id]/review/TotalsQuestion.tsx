"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryExtractionAction, settleTotalsAction } from "@/app/(catalog)/actions";
import { Button } from "@/app/(catalog)/ui";

/**
 * A document whose lines do not add up to its own totals, put to the person: read it again, or
 * say the lines are right as read. Until one or the other, the export lists it and a push asks.
 */
export function TotalsQuestion({ batchId, fileId, filename, said }: { batchId: string; fileId: string; filename: string; said: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const act = (run: () => Promise<{ ok: boolean; error?: string }>, then: () => void) => start(async () => {
    setError(null);
    try {
      const r = await run();
      if (!r.ok) { setError(r.error ?? "That did not work; try again."); return; }
      then();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  });
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-1.5">
      <span className="min-w-0 flex-1"><strong>{filename}</strong>: {said}</span>
      <span className="inline-flex flex-wrap items-center gap-2">
        {/* The read runs on the upload page, which builds again once it is done. */}
        <Button size="sm" disabled={pending} onClick={() => act(() => retryExtractionAction(fileId), () => router.push(`/batches/${batchId}`))}>Read it again</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => settleTotalsAction(fileId), () => router.refresh())}>The lines are right</Button>
      </span>
      {error && <span className="w-full text-xs text-red-700">{error}</span>}
    </li>
  );
}
