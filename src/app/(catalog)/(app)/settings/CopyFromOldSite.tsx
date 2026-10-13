"use client";

import { useState } from "react";
import { copyFromOldSiteAction } from "@/app/(catalog)/actions";
import { Alert, Button, INPUT, cx } from "@/app/(catalog)/ui";
import type { CopyState } from "@/lib/catalog/migrate";

/**
 * Bring everything over from the old Rubin.
 *
 * Two strings from the old Vercel project — the database connection string and the file store's
 * token — and the new site copies the lot for itself, in steps, saying what it has done as it
 * goes. The strings never leave this page except to run each step; nothing is kept.
 */
export function CopyFromOldSite() {
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [blobToken, setBlobToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true); setError(null); setLines([]); setDone(false);
    let state: CopyState | null = null;
    try {
      for (let step = 1; step <= 400; step++) {
        const r = await copyFromOldSiteAction({ databaseUrl, blobToken, state });
        if (!r.ok) { setError(r.error); return; }
        state = r.data!.state;
        const got = r.data!.lines;
        if (got.length > 0) setLines((l) => [...l, ...got]);
        else setLines((l) => [...l, `Step ${step}: still going — ${Object.values(state!.counts).reduce((n, c) => n + c, 0)} rows and ${state!.files.copied} files so far.`]);
        if (r.data!.done) { setDone(true); return; }
      }
      setError("Stopped after 400 steps without finishing. Press the button again; it carries on from where it got to.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ink-soft)]">
        Both strings are in the old Vercel project: <strong>Storage → the Neon database → the .env.local tab</strong> for the connection string (the plain <code>postgres://</code> one), and <strong>Storage → the Blob store → the .env.local tab</strong> for the token. Everything comes over: accounts, settings, rules, templates, the shop memory, every batch with its files and pictures. An account that already exists here by email is kept, and the old site&rsquo;s work is written against it. Run it once, on this fresh site.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Old site&rsquo;s database connection string</span>
        <input id="copy-database-url" type="password" className={INPUT} value={databaseUrl} onChange={(e) => setDatabaseUrl(e.target.value)} placeholder="postgres://…@….neon.tech/neondb?sslmode=require" disabled={busy || done} autoComplete="off" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Old site&rsquo;s file store token <span className="font-normal text-[var(--ink-soft)]">(optional; without it the files stay in the old store)</span></span>
        <input id="copy-blob-token" type="password" className={INPUT} value={blobToken} onChange={(e) => setBlobToken(e.target.value)} placeholder="vercel_blob_rw_…" disabled={busy || done} autoComplete="off" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="📦" disabled={busy || done || !databaseUrl.trim()} onClick={() => void run()}>{busy ? "Copying…" : done ? "Copied" : "Copy everything from the old site"}</Button>
        {busy && <span className="text-xs text-[var(--ink-soft)]">Keep this page open. A big site takes a few minutes; the log below fills as it goes.</span>}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">Done. Sign out and in again, then look at History and a recent batch to see it all here.</Alert>}
      {lines.length > 0 && (
        <pre className={cx("max-h-72 overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--canvas)] p-3 text-xs")}>{lines.join("\n")}</pre>
      )}
    </div>
  );
}
