"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT_INLINE } from "@/app/(catalog)/ui";

/**
 * The margin under which a variant is flagged for a look. Only a floor: a thin margin is worth a
 * glance, but how much a shop earns is its own business, so nothing stops an export for being
 * too good. A price under cost is a different thing (a cost in the price column) and is refused.
 */
export function MarginFloor({ minMarginPct }: { minMarginPct: number }) {
  const [min, setMin] = useState(String(minMarginPct));
  const [note, setNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const lo = Number(min);
      if (!(lo >= 0 && lo < 100)) return setNote({ tone: "danger", text: "The floor is a percentage between 0 and 99." });
      const r = await saveSettingsAction({ minMarginPct: lo });
      setNote(r.ok ? { tone: "success", text: "Saved. Every batch is checked against the new floor from now on." } : { tone: "danger", text: r.error });
    });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--ink-soft)]">A margin under the floor is flagged on the review grid so somebody looks at it. It is a warning, not a stop: the batch still exports. A price under the landed cost is refused, since that is nearly always a cost in the price column.</p>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Floor (warn below)"><input className={INPUT_INLINE} type="number" min={0} max={99} step={1} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum margin percent" /> %</Field>
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save the floor"}</Button>
      </div>
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
    </div>
  );
}
