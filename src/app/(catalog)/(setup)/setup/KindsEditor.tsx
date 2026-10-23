"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveKindsAction } from "@/app/(catalog)/actions";
import { Alert, Button, INPUT } from "@/app/(catalog)/ui";
import type { KindRule } from "@/lib/catalog/house";

/**
 * What the shop says about each product type an export showed: what it is called (the Type
 * written on every listing of the kind), the tags every one of them gets, and how a title of the
 * kind reads. Pre-filled from the export's own rows; the person corrects and adds. Saved kinds
 * are merged by Type, so a shop exporting a category at a time builds the list up.
 */
export function KindsEditor({ kinds: initial, title, blurb, onSaved }: { kinds: KindRule[]; title?: string; blurb?: string; onSaved?: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Array<KindRule & { tagsText: string }>>(initial.map((k) => ({ ...k, tagsText: k.tags.join(", ") })));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<KindRule & { tagsText: string }>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      setNote(null);
      const kinds = rows.map(({ tagsText, ...k }) => ({ ...k, tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean) }));
      const r = await saveKindsAction({ kinds });
      if (!r.ok) return setNote({ ok: false, text: r.error });
      setNote({ ok: true, text: `Kept. Flöda now knows ${r.data?.kinds ?? kinds.length} kind${(r.data?.kinds ?? kinds.length) === 1 ? "" : "s"} of product by what you call them, their tags and how their titles read.` });
      onSaved?.();
      router.refresh();
    });

  if (rows.length === 0) return null;
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-white">
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="text-[14px] font-semibold">{title ?? "The product types in this export"}</div>
        <div className="mt-0.5 text-[13px] text-[var(--ink-soft)]">{blurb ?? "For each one: what you call it, the tags every one of them should carry, and how its titles read. What the export shows is filled in; change what is wrong and add what is missing."}</div>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[13.5px]">
          <thead className="text-left text-[11.5px] uppercase tracking-wide text-[var(--ink-soft)]">
            <tr>
              <th className="px-3 py-2 font-semibold">In the export</th>
              <th className="px-3 py-2 font-semibold">What you call it</th>
              <th className="px-3 py-2 font-semibold">Tags every one gets</th>
              <th className="px-3 py-2 font-semibold">A title reads like</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.type} className="border-t border-[var(--line-soft)] align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.type}</div>
                  <div className="text-[12px] text-[var(--ink-soft)]">{r.count} product{r.count === 1 ? "" : "s"}</div>
                </td>
                <td className="px-3 py-2"><input className={`${INPUT} min-w-[11rem]`} value={r.calledAs} onChange={(e) => set(i, { calledAs: e.target.value })} placeholder={r.type} /></td>
                <td className="px-3 py-2"><input className={`${INPUT} min-w-[16rem]`} value={r.tagsText} onChange={(e) => set(i, { tagsText: e.target.value })} placeholder="ski, ski-gear, mens" /><div className="mt-0.5 text-[11.5px] text-[var(--ink-soft)]">Comma-separated. These are added on every product of this type.</div></td>
                <td className="px-3 py-2"><input className={`${INPUT} min-w-[14rem]`} value={r.titleFormat} onChange={(e) => set(i, { titleFormat: e.target.value })} placeholder="Völkl Mantra 88 2026" /><div className="mt-0.5 text-[11.5px] text-[var(--ink-soft)]">One real title, or the shape: Brand Model Year.</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line-soft)] px-4 py-3">
        <Button variant="primary" size="sm" disabled={pending} onClick={save}>{pending ? "Keeping…" : "Keep these"}</Button>
        <span className="text-[12.5px] text-[var(--ink-soft)]">A product type with a new name becomes one of yours; its tags and title pattern are applied to every product of that type Flöda builds.</span>
      </div>
      {note && <div className="px-4 pb-3"><Alert tone={note.ok ? "success" : "danger"}>{note.text}</Alert></div>}
    </div>
  );
}
