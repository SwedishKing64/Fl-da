"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBatchPicksAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";

/**
 * Which bindings each ski's package offers (asked 2026-10-20), ticked from the shop's binding list
 * (Settings). A package is made at the build, so saving builds the batch again with the picks.
 */
export interface PackageSki { key: string; title: string; current: string[] }

export function PackagesPanel({ batchId, skis, bindings, locked }: { batchId: string; skis: PackageSki[]; bindings: string[]; locked: boolean }) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, string[]>>(() => Object.fromEntries(skis.map((s) => [s.key, s.current])));
  const [touched, setTouched] = useState<string[]>([]);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(true);

  if (skis.length === 0) return null;
  const toggle = (key: string, name: string) => {
    setPicks((p) => {
      const now = p[key] ?? [];
      return { ...p, [key]: now.includes(name) ? now.filter((n) => n !== name) : [...now, name] };
    });
    setTouched((t) => (t.includes(key) ? t : [...t, key]));
  };
  function save() {
    // Only the skis somebody changed: the rest keep taking the defaults.
    const changed = Object.fromEntries(touched.map((k) => [k, picks[k] ?? []]));
    start(async () => {
      const r = await saveBatchPicksAction(batchId, changed);
      setSaid(r.ok ? { ok: true, text: `Saved, and the products were built again with those bindings (${r.data!.products} products).` } : { ok: false, text: r.error });
      if (r.ok) { setTouched([]); router.refresh(); }
    });
  }

  return (
    <Card
      className="mb-4"
      title={<>Ski packages <span className="font-normal text-[var(--ink-soft)]">· {skis.length} ski{skis.length === 1 ? "" : "s"}</span></>}
      actions={<>
        <Button size="sm" variant="primary" icon="🎿" disabled={locked || pending || touched.length === 0 || bindings.length === 0} onClick={save}>{pending ? "Building…" : "Save the bindings"}</Button>
        <Button size="sm" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</Button>
      </>}
    >
      {bindings.length === 0
        ? <Alert tone="info">Load the binding list in Settings first; each ski can then be packaged with any binding on it.</Alert>
        : <p className="mb-3 text-xs text-[var(--ink-soft)]">Tick the bindings each ski&rsquo;s package offers — one or several. A ski with none ticked gets no package. Untouched skis keep the usual binding (men&rsquo;s Griffon, women&rsquo;s Squire).</p>}
      {said && <Alert tone={said.ok ? "success" : "danger"} className="mb-3">{said.text}</Alert>}
      {open && bindings.length > 0 && (
        <ul className="max-h-[28rem] space-y-3 overflow-auto pr-1">
          {skis.map((s) => (
            <li key={s.key}>
              <div className="text-sm font-medium">{s.title}{touched.includes(s.key) && <span className="ml-2 text-xs font-normal text-amber-800">changed — not saved yet</span>}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {bindings.map((b) => (
                  <label key={b} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" disabled={locked || pending} checked={(picks[s.key] ?? []).includes(b)} onChange={() => toggle(s.key, b)} />
                    {b}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
