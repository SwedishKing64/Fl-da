"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT_INLINE } from "@/app/(catalog)/ui";

/**
 * The band a margin is believed in. Below the floor the review warns; above the ceiling, or
 * below cost, the export refuses, because a margin no shop earns is a cost in the wrong column
 * or a cost per carton read as per unit, not a price.
 */
export function MarginBand({ minMarginPct, maxMarginPct }: { minMarginPct: number; maxMarginPct: number }) {
  const [min, setMin] = useState(String(minMarginPct));
  const [max, setMax] = useState(String(maxMarginPct));
  const [note, setNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const lo = Number(min), hi = Number(max);
      if (!(lo >= 0 && hi <= 100 && lo < hi)) return setNote({ tone: "danger", text: "The floor must be below the ceiling, between 0 and 100." });
      const r = await saveSettingsAction({ minMarginPct: lo, maxMarginPct: hi });
      setNote(r.ok ? { tone: "success", text: "Saved. Every batch is checked against the new band from now on." } : { tone: "danger", text: r.error });
    });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--ink-soft)]">A margin under the floor is flagged for a look. A margin over the ceiling, or a price under cost, stops the export: it is nearly always a cost in the price column, a list price in the cost column, or a carton price taken as a unit price, and a wrong number in the file is a wrong number on the shop.</p>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Floor (warn below)"><input className={INPUT_INLINE} type="number" min={0} max={100} step={1} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum margin percent" /> %</Field>
        <Field label="Ceiling (refuse above)"><input className={INPUT_INLINE} type="number" min={0} max={100} step={1} value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum margin percent" /> %</Field>
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save the band"}</Button>
      </div>
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
    </div>
  );
}
