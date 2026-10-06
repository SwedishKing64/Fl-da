"use client";

import { useEffect } from "react";
import { Alert, Button } from "@/app/(catalog)/ui";

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
        {message && <p className="mt-2 break-words font-mono text-xs opacity-80">{message}{error.digest ? ` · digest ${error.digest}` : ""}</p>}
      </Alert>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => reset()}>Try again</Button>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    </div>
  );
}
