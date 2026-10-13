"use client";

import { useEffect, useState } from "react";
import { Alert, Button } from "@/app/(catalog)/ui";
import { explainErrorAction } from "@/app/(catalog)/actions";

/**
 * Where a page inside the app lands when something it asked for throws.
 *
 * Without this, any error a button's request threw — a request the host cut off at its minute,
 * a dropped connection — fell through to the last-resort page, which drops the whole app shell
 * and blames the database. That page is for a layout that cannot render at all. This one keeps
 * the shell, says what the error said, and puts the page back as it was.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[page]", error); }, [error]);
  // Production hides a server error's message and gives a digest; the server recorded the
  // message under that digest (see instrumentation.ts), so it is fetched and shown here.
  const [explained, setExplained] = useState<{ message: string; where: string } | null>(null);
  useEffect(() => {
    if (!error.digest) return;
    let stop = false;
    const look = async (tries: number) => {
      try {
        const r = await explainErrorAction(error.digest!);
        if (stop) return;
        if (r.ok && r.data) { setExplained(r.data); return; }
      } catch { /* nothing to show then */ }
      if (!stop && tries > 0) setTimeout(() => void look(tries - 1), 1500);
    };
    void look(3);
    return () => { stop = true; };
  }, [error.digest]);
  const message = (error.message || "").trim();
  const cutOff = /timed? ?out|504|gateway|fetch failed|network|failed to fetch|unexpected response/i.test(message);
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">That did not finish</h1>
      <Alert tone="danger">
        <p>
          {cutOff
            ? "The request behind what you pressed was cut off before it answered — the host gives each one five minutes. Whatever it had done up to then is saved; Try again puts the page back, and what was running can be pressed again."
            : "The request behind what you pressed failed. Try again puts the page back as it was."}
        </p>
        {explained && <p className="mt-2 break-words text-sm"><strong>What the server said:</strong> {explained.message}{explained.where ? <span className="opacity-70"> ({explained.where})</span> : null}</p>}
        {message && <p className="mt-2 break-words font-mono text-xs opacity-80">{message}{error.digest ? ` · digest ${error.digest}` : ""}</p>}
      </Alert>
      <div className="flex gap-2">
        <Button variant="primary" icon="🔄" onClick={() => reset()}>Try again</Button>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    </div>
  );
}
