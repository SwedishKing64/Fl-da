"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreRulesAction, rulesHistoryAction } from "@/app/(catalog)/actions";
import { Button, fmtDate } from "@/app/(catalog)/ui";

/**
 * Undo on Teach Snaben: the rules as they stood before each of the last ten changes, each
 * named by the change that followed it. Going back keeps the rules as they are now first, so
 * that too can be undone.
 */
export function RulesHistory() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Array<{ id: string; label: string; at: string }> | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const load = () => start(async () => {
    setNote("");
    const r = await rulesHistoryAction();
    if (!r.ok) return setNote(r.error);
    setEntries(r.data ?? []);
    setOpen(true);
  });
  const back = (id: string, label: string) => {
    if (!confirm(`Go back to how the rules stood ${label.replace(/^Before /, "before ")}? The rules as they are now are kept, so this can be undone too.`)) return;
    start(async () => {
      setNote("");
      const r = await restoreRulesAction(id);
      if (!r.ok) return setNote(r.error);
      setNote(`Back to ${r.data?.restored ?? "before"}.`);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => (open ? setOpen(false) : load())}>Undo a change</Button>
      {note && <span className="ml-2 text-[12.5px] text-[var(--ink-soft)]">{note}</span>}
      {open && entries && (
        <div className="absolute right-0 z-20 mt-2 w-[26rem] max-w-[90vw] rounded-[12px] border border-[var(--line)] bg-white p-3 shadow-lg">
          <p className="mb-2 text-[12.5px] text-[var(--ink-soft)]">The rules as they stood before each recent change, newest first. Going back keeps today&rsquo;s rules too.</p>
          {entries.length === 0 ? <p className="text-[13px] text-[var(--ink-soft)]">No change to undo yet.</p> : (
            <ul className="max-h-80 divide-y divide-[var(--line-soft)] overflow-auto">
              {entries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 py-2 text-[13px]">
                  <span className="min-w-0 flex-1"><span className="block">{e.label}</span><span className="block text-[11.5px] text-[var(--ink-soft)]">{e.at ? fmtDate(e.at) : ""}</span></span>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => back(e.id, e.label)}>Back to this</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
