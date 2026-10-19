"use client";

import { useRef, useState, useTransition } from "react";
import { saveBindingListAction } from "@/app/(catalog)/actions";
import { Alert, Button } from "@/app/(catalog)/ui";
import type { BindingList } from "@/lib/catalog/trades/snow/binding-list";

const base64Of = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
  reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
  reader.readAsDataURL(file);
});

/**
 * The bindings a ski can be packaged with, and what each sells for and costs. Loaded once from a
 * sheet ("Binding Name", "RRP", "Wholesale") and kept; a newer sheet replaces it. See binding-list.ts.
 */
export function BindingListCard({ initial, fees }: { initial: BindingList | null; fees: { drill: number; system: number } }) {
  const [list, setList] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function load(file: File) {
    setError(null);
    start(async () => {
      const r = await saveBindingListAction({ name: file.name, type: file.type, base64: await base64Of(file) });
      if (!r.ok) setError(r.error);
      else setList(r.data!);
    });
  }

  return (
    <div className="text-sm">
      <p className="mb-3 text-xs text-[var(--ink-soft)]">
        Every new ski can be packaged with any of these, picked under the ski on the review page and on Prices and stock. A package is the ski&rsquo;s RRP plus the binding&rsquo;s, and costs the ski&rsquo;s cost plus the binding&rsquo;s wholesale. Mounting adds ${fees.drill} for a drill mount and ${fees.system} for a system binding. The shop&rsquo;s own list is built in; load a newer sheet (&ldquo;Binding Name&rdquo;, &ldquo;RRP&rdquo;, &ldquo;Wholesale&rdquo;) to replace it.
      </p>
      {list && list.entries.length > 0 && (
        <table className="mb-3 w-full">
          <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Binding</th><th className="text-right">RRP</th><th className="text-right">Wholesale</th></tr></thead>
          <tbody>
            {list.entries.map((e) => (
              <tr key={e.name} className="border-t border-[var(--line-soft)]">
                <td className="py-1">{e.name}</td>
                <td className="text-right tabular-nums">{e.rrp.toFixed(2)}</td>
                <td className="text-right tabular-nums">{e.cost === null ? "—" : e.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list && <p className="mb-3 text-xs text-[var(--ink-soft)]">From {list.file}, {new Date(list.updatedAt).toLocaleDateString()}.</p>}
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
      <Button size="sm" icon="🎿" disabled={pending} onClick={() => input.current?.click()}>{pending ? "Loading…" : list ? "Load a newer list" : "Load the binding list"}</Button>
    </div>
  );
}
