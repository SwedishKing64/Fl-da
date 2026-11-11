"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBindingEntriesAction, saveBindingListAction, saveSettingsAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import type { BindingEntry, BindingList } from "@/lib/catalog/trades/snow/binding-list";
import type { PackageTerms } from "@/lib/catalog/types";

const base64Of = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
  reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
  reader.readAsDataURL(file);
});

type Row = { name: string; rrp: string; cost: string };
const rowOf = (e: BindingEntry): Row => ({ name: e.name, rrp: String(e.rrp), cost: e.cost === null ? "" : String(e.cost) });

/**
 * The bindings a ski can be packaged with, and what each sells for and costs: the shop's own,
 * typed in a row at a time or loaded from a sheet ("Binding Name", "RRP", "Wholesale"). Under
 * them, what the shop charges to mount a binding and how it words the two fittings. Nothing here
 * is built in: a new copy has no bindings, no charge, and plain words.
 */
export function BindingListCard({ initial, terms: initialTerms }: { initial: BindingList | null; terms: PackageTerms }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>((initial?.entries ?? []).map(rowOf));
  const [file, setFile] = useState(initial?.file ?? "");
  const [terms, setTerms] = useState({ drillMountFee: String(initialTerms.drillMountFee), systemMountFee: String(initialTerms.systemMountFee), fittingMount: initialTerms.fittingMount, fittingNoMount: initialTerms.fittingNoMount });
  const [note, setNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const keepRows = () =>
    start(async () => {
      setNote(null);
      const entries = rows.map((r) => ({ name: r.name.trim(), rrp: Number(r.rrp), cost: r.cost.trim() === "" ? null : Number(r.cost) })).filter((e) => e.name);
      const bad = entries.find((e) => !Number.isFinite(e.rrp) || e.rrp <= 0 || (e.cost !== null && (!Number.isFinite(e.cost) || e.cost < 0)));
      if (bad) return setNote({ tone: "danger", text: `${bad.name} needs a retail price (and a wholesale that is a number, or none).` });
      const r = await saveBindingEntriesAction({ entries });
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      setRows(entries.map(rowOf));
      setFile("typed in");
      setNote({ tone: "success", text: entries.length ? `Kept: ${entries.length} binding${entries.length === 1 ? "" : "s"} to package skis with.` : "Kept: no bindings, so no ski gets a package until some are added." });
      router.refresh();
    });

  const keepTerms = () =>
    start(async () => {
      setNote(null);
      const r = await saveSettingsAction({ packages: { drillMountFee: Number(terms.drillMountFee) || 0, systemMountFee: Number(terms.systemMountFee) || 0, fittingMount: terms.fittingMount.trim(), fittingNoMount: terms.fittingNoMount.trim() } });
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      setNote({ tone: "success", text: "Kept: the mounting charges and the fitting wording." });
      router.refresh();
    });

  function load(f: File) {
    setNote(null);
    start(async () => {
      const r = await saveBindingListAction({ name: f.name, type: f.type, base64: await base64Of(f) });
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      setRows(r.data!.entries.map(rowOf));
      setFile(r.data!.file);
      setNote({ tone: "success", text: `Read ${r.data!.entries.length} binding${r.data!.entries.length === 1 ? "" : "s"} from ${f.name}.` });
      router.refresh();
    });
  }

  return (
    <div className="text-sm" id="packages">
      <p className="mb-3 text-[13px] text-[var(--ink-soft)]">
        Every new ski can be packaged with any of these, picked under the ski on the review page and on Prices and stock. A package is the ski&rsquo;s RRP plus the binding&rsquo;s, and costs the ski&rsquo;s cost plus the binding&rsquo;s wholesale. Type them in, or load a sheet with &ldquo;Binding Name&rdquo;, &ldquo;RRP&rdquo; and &ldquo;Wholesale&rdquo; columns.
      </p>
      <table className="mb-2 w-full">
        <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1 font-semibold">Binding</th><th className="py-1 font-semibold">RRP</th><th className="py-1 font-semibold">Wholesale</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--line-soft)]">
              <td className="py-1 pr-2"><input className={INPUT} value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Marker Griffon 13" /></td>
              <td className="py-1 pr-2"><input type="number" min={0} step={0.01} className={`${INPUT} w-28`} value={r.rrp} onChange={(e) => set(i, { rrp: e.target.value })} placeholder="459.99" /></td>
              <td className="py-1 pr-2"><input type="number" min={0} step={0.01} className={`${INPUT} w-28`} value={r.cost} onChange={(e) => set(i, { cost: e.target.value })} placeholder="optional" /></td>
              <td className="py-1 text-right"><button type="button" className="text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr className="border-t border-[var(--line-soft)]"><td colSpan={4} className="py-2 text-[13px] text-[var(--ink-soft)]">No bindings yet: no ski gets a package until there are some.</td></tr>}
        </tbody>
      </table>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRows((rs) => [...rs, { name: "", rrp: "", cost: "" }])}>+ Add a binding</Button>
        <Button size="sm" variant="primary" disabled={pending} onClick={keepRows}>{pending ? "Keeping…" : "Keep the list"}</Button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => input.current?.click()}>Load a sheet</Button>
        {file && <span className="text-xs text-[var(--ink-soft)]">From {file}.</span>}
      </div>
      <div className="grid gap-3 border-t border-[var(--line-soft)] pt-4 sm:grid-cols-2">
        <Field label="Charge to drill-mount a binding" hint="Added to the package's retail for the mounted fitting. 0 for no charge."><input type="number" min={0} step={1} className={`${INPUT} w-32`} value={terms.drillMountFee} onChange={(e) => setTerms({ ...terms, drillMountFee: e.target.value })} /></Field>
        <Field label="Charge to fit a system binding" hint="A binding that clicks onto a rail the ski already has."><input type="number" min={0} step={1} className={`${INPUT} w-32`} value={terms.systemMountFee} onChange={(e) => setTerms({ ...terms, systemMountFee: e.target.value })} /></Field>
        <Field label="The mounted fitting is called"><input className={INPUT} value={terms.fittingMount} onChange={(e) => setTerms({ ...terms, fittingMount: e.target.value })} placeholder="Please Mount My Bindings" /></Field>
        <Field label="The unmounted fitting is called"><input className={INPUT} value={terms.fittingNoMount} onChange={(e) => setTerms({ ...terms, fittingNoMount: e.target.value })} placeholder="Do Not Mount My Bindings" /></Field>
        <div className="sm:col-span-2"><Button size="sm" variant="primary" disabled={pending} onClick={keepTerms}>{pending ? "Keeping…" : "Keep the charges and wording"}</Button></div>
      </div>
      {note && <Alert tone={note.tone} className="mt-3">{note.text}</Alert>}
    </div>
  );
}
