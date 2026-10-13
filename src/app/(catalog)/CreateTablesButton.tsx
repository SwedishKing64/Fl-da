"use client";

import { useState, useTransition } from "react";
import { createTablesAction } from "./actions";

/**
 * Create the tables from the browser, when the build could not.
 *
 * The advice underneath — check the connection string, redeploy, run `prisma db push` — is only
 * useful to someone who can reach a terminal with that connection string in it. This is the same
 * thing for someone who has the app open and nothing else.
 */
export function CreateTablesButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Tables created. The app will ask you to set up the first account.
        {/* A hard load, not a client navigation: the gate that put this screen here is decided on
            the server, and only a fresh request re-decides it. */}
        <button type="button" onClick={() => window.location.assign("/")} className="ml-2 font-semibold underline">
          Open the app
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const result = await createTablesAction();
          if (result.ok) setDone(true);
          else setError(result.error);
        })}
        className="inline-flex items-center rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
      >
        {pending ? "Creating the tables…" : "Create the tables now"}
      </button>
      <p className="mt-1.5 text-xs text-[var(--ink-soft)]">
        Runs the same statements the build would have. Safe on an empty database, and it stops rather than touching a table that already exists.
      </p>
      {error && <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 font-mono text-xs break-words text-red-900">{error}</p>}
    </div>
  );
}
