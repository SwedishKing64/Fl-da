"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSeasonsAction, saveShelvesAction } from "@/app/(catalog)/actions";
import { Button, INPUT, cx } from "@/app/(catalog)/ui";
import type { Shelf } from "@/lib/catalog/shelves";
import { seasonTag, type SeasonVocabulary } from "@/lib/catalog/seasons";

type Row = Shelf;

/**
 * The shop's shelves in its own words: each tag or collection as the export and website have
 * it, and beside it what it is now called or merged into, what it sits under, and whether it is
 * seasonal. Below, the seasons: their names and start days, and the tag a seasonal shelf's
 * products carry.
 */
export function ShelvesCard({ shelves, seasons, known }: { shelves: Shelf[]; seasons: SeasonVocabulary; known: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(shelves);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [vocab, setVocab] = useState<SeasonVocabulary>(seasons);
  const [seasonNote, setSeasonNote] = useState("");

  const named = new Set(rows.map((r) => r.name.toLowerCase()));
  const candidates = known.filter((k) => !named.has(k.toLowerCase()));
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = (name: string) => setRows((rs) => [...rs, { name, kind: "tag", becomes: "", under: "", seasonal: false }]);
  const save = () => start(async () => {
    setNote("");
    const r = await saveShelvesAction(rows);
    setNote(r.ok ? "Kept." : r.error);
    if (r.ok) router.refresh();
  });
  const saveSeasons = () => start(async () => {
    setSeasonNote("");
    const r = await saveSeasonsAction(vocab);
    setSeasonNote(r.ok ? "Kept." : r.error);
    if (r.ok) router.refresh();
  });
  const shown = showAll ? candidates : candidates.slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[14px] text-[var(--ink-soft)]">Your tags and collections as your export and website have them. Say what any is now called or merged into, what it sits under (a product on it carries the parent too), and which are seasonal. Everything else stays as it is.</p>
        {rows.length > 0 && (
          <div className="mt-3 overflow-auto rounded-[12px] border border-[var(--line)] bg-white">
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] text-[var(--ink-soft)]"><tr><th className="px-3 py-2 font-semibold">Shelf</th><th className="px-3 py-2 font-semibold">Kind</th><th className="px-3 py-2 font-semibold">Now called, or merged into</th><th className="px-3 py-2 font-semibold">Sits under</th><th className="px-3 py-2 font-semibold">Seasonal</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--line-soft)]">
                    <td className="px-3 py-1.5"><input className={cx(INPUT, "min-w-[8rem]")} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} /></td>
                    <td className="px-3 py-1.5"><select className={INPUT} value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value === "collection" ? "collection" : "tag" })}><option value="tag">tag</option><option value="collection">collection</option></select></td>
                    <td className="px-3 py-1.5"><input className={cx(INPUT, "min-w-[8rem]")} list="shelf-names" value={r.becomes} onChange={(e) => setRow(i, { becomes: e.target.value })} placeholder="keep the name" /></td>
                    <td className="px-3 py-1.5"><input className={cx(INPUT, "min-w-[8rem]")} list="shelf-names" value={r.under} onChange={(e) => setRow(i, { under: e.target.value })} placeholder="none" /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={r.seasonal} onChange={(e) => setRow(i, { seasonal: e.target.checked })} /></td>
                    <td className="px-3 py-1.5"><button type="button" className="text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--danger)]" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <datalist id="shelf-names">{[...new Set([...known, ...rows.map((r) => r.becomes), ...rows.map((r) => r.under)])].filter(Boolean).map((n) => <option key={n} value={n} />)}</datalist>
        <div className="mt-3">
          <span className="mb-1 block text-[12.5px] font-semibold text-[var(--ink-2)]">Add a shelf to change</span>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((k) => <button key={k} type="button" className="rounded-full border border-[var(--line)] bg-white px-2.5 py-0.5 text-[12.5px] hover:border-[var(--meta)]" onClick={() => addRow(k)}>{k}</button>)}
            {candidates.length > 12 && <button type="button" className="text-[12.5px] font-semibold text-[var(--meta)]" onClick={() => setShowAll((s) => !s)}>{showAll ? "Fewer" : `${candidates.length - 12} more…`}</button>}
            <button type="button" className="rounded-full border border-dashed border-[var(--line)] px-2.5 py-0.5 text-[12.5px] text-[var(--ink-soft)]" onClick={() => addRow("")}>{candidates.length ? "+ another" : "+ a shelf"}</button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="primary" disabled={pending} onClick={save}>Keep the shelves</Button>
          {note && <span className={cx("text-[12.5px]", note === "Kept." ? "text-[var(--promoter)]" : "text-[var(--danger)]")}>{note}</span>}
        </div>
      </div>

      <div className="border-t border-[var(--line-soft)] pt-4">
        <h3 className="text-[15px] font-semibold">Your seasons</h3>
        <p className="mt-1 text-[14px] text-[var(--ink-soft)]">Name your seasons and the day each starts. A product on a seasonal shelf carries the current season&rsquo;s tag, written by the pattern below; the model year in titles stays as the Titles area has it.</p>
        <div className="mt-3 space-y-2">
          {vocab.seasons.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className={cx(INPUT, "w-40")} value={s.name} placeholder="Winter" onChange={(e) => setVocab((v) => ({ ...v, seasons: v.seasons.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
              <span className="text-[13px] text-[var(--ink-soft)]">starts</span>
              <input className={cx(INPUT, "w-24")} value={s.starts} placeholder="05-01" onChange={(e) => setVocab((v) => ({ ...v, seasons: v.seasons.map((x, j) => (j === i ? { ...x, starts: e.target.value } : x)) }))} />
              <span className="text-[12px] text-[var(--ink-soft)]">(MM-DD)</span>
              <button type="button" className="text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--danger)]" onClick={() => setVocab((v) => ({ ...v, seasons: v.seasons.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-[13px] font-semibold text-[var(--meta)]" onClick={() => setVocab((v) => ({ ...v, seasons: [...v.seasons, { name: "", starts: "" }] }))}>+ Add a season</button>
          <label className="block text-sm"><span className="mb-1 block text-[12.5px] font-semibold text-[var(--ink-2)]">The season tag ({"{season}"}, {"{year}"}, {"{yy}"})</span><input className={cx(INPUT, "w-60")} value={vocab.tag} onChange={(e) => setVocab((v) => ({ ...v, tag: e.target.value }))} /></label>
          <p className="text-[12.5px] text-[var(--ink-soft)]">Right now that would be: <strong>{seasonTag({ seasons: vocab.seasons.filter((s) => s.name && /^\d{2}-\d{2}$/.test(s.starts)), tag: vocab.tag || "{season} {year}" }) || "(no season yet)"}</strong></p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={saveSeasons}>Keep the seasons</Button>
            {seasonNote && <span className={cx("text-[12.5px]", seasonNote === "Kept." ? "text-[var(--promoter)]" : "text-[var(--danger)]")}>{seasonNote}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
