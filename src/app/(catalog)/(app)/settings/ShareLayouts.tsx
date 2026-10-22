"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/(catalog)/actions";
import { Alert } from "@/app/(catalog)/ui";

/**
 * Whether this shop shares the supplier layouts it confirms, and starts from other shops'. What goes
 * is a file's column headings and which field each is: never a value, a price, a supplier's name or
 * which shop sent it.
 */
export function ShareLayouts({ on }: { on: boolean }) {
  const [checked, setChecked] = useState(on);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const change = (next: boolean) => start(async () => {
    setError(null);
    const r = await saveSettingsAction({ shareLayouts: next });
    if (r.ok) setChecked(next);
    else setError(r.error);
  });
  return (
    <div className="mt-4 border-t border-[var(--line-soft)] pt-4 text-[13.5px]">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5" checked={checked} disabled={pending} onChange={(e) => change(e.target.checked)} />
        <span>
          <strong>Share supplier layouts with other shops</strong>
          <span className="mt-1 block text-[var(--ink-soft)]">
            When you confirm how a supplier&rsquo;s spreadsheet reads, its column headings and what each one is are shared, so the next shop that buys from that supplier does not have to teach it again, and you start from theirs. Never a value from the file, never a price, never the supplier&rsquo;s name or yours.
          </span>
        </span>
      </label>
      {error && <Alert tone="danger" className="mt-2">{error}</Alert>}
    </div>
  );
}
