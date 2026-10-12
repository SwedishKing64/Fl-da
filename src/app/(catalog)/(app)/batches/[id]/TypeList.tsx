"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBuildTypesAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";
import { typeKey } from "@/lib/catalog/kinds";

/**
 * Which kinds of product this batch works with.
 *
 * A Burton order arrives with boards, bindings, boots, outerwear, gloves and bags on one form,
 * and nobody wants to review a hundred and twenty products in one sitting. Each kind the order
 * holds is a tick here, with how many products it has; tick only the boards and the rest are set
 * aside — kept with the batch, so a build run again still leaves them out — and ticked back in
 * when it is their turn. Nothing ticked means every kind.
 */
export function TypeList({ batchId, built, seen, chosen, locked }: { batchId: string; built: string[]; seen: string[]; chosen: string[]; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  // Every kind the order was found to hold, with the count of products built of it now.
  const counts = new Map<string, { name: string; n: number }>();
  for (const name of [...seen, ...chosen, ...built]) {
    const key = typeKey(name);
    if (!key) continue;
    const row = counts.get(key) ?? { name: name.trim(), n: 0 };
    counts.set(key, row);
  }
  for (const name of built) {
    const row = counts.get(typeKey(name));
    if (row) row.n += 1;
  }
  const kinds = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (kinds.length < 2 && chosen.length === 0) return null;

  const on = (name: string) => chosen.length === 0 || chosen.some((c) => typeKey(c) === typeKey(name));
  const change = (types: string[]) => start(async () => {
    const r = await setBuildTypesAction(batchId, types);
    if (!r.ok) { setSaid({ tone: "danger", text: r.error }); return; }
    setSaid(r.data!.said ? { tone: "info", text: r.data!.said } : null);
    router.refresh();
  });
  const toggle = (name: string) => {
    const now = kinds.filter((k) => on(k.name)).map((k) => k.name);
    const next = on(name) ? now.filter((n) => typeKey(n) !== typeKey(name)) : [...now, name];
    // Every kind ticked is the same as none chosen.
    change(next.length === kinds.length ? [] : next);
  };
  const working = kinds.filter((k) => on(k.name)).length;

  return (
    <Card
      className="mb-4"
      title={<>Kinds of product to work with <span className="font-normal text-[var(--ink-soft)]">· {chosen.length === 0 ? "all of them" : `${working} of ${kinds.length}`}</span></>}
      actions={<>
        {!locked && chosen.length > 0 && <Button size="sm" icon="📦" disabled={pending} onClick={() => change([])}>Work with all of them</Button>}
      </>}
    >
      <p className="mb-3 text-xs text-[var(--ink-soft)]">An order can hold boards, bindings, boots and clothing at once. Tick the kinds to do now; the rest are set aside and come back when you tick them. Nothing ticked means every kind.</p>
      {said && <Alert tone={said.tone} className="mb-3">{said.text}</Alert>}
      <ul className="flex flex-wrap gap-2">
        {kinds.map((k) => {
          const active = on(k.name);
          return (
            <li key={k.name}>
              <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${active ? "border-[var(--meta)] bg-[var(--meta-tint)] text-[var(--meta-ink)]" : "border-[var(--line)] text-[var(--ink-soft)]"}`}>
                <input type="checkbox" checked={active} disabled={locked || pending} onChange={() => toggle(k.name)} />
                <span>{k.name}</span>
                <span className="text-xs opacity-70">{active ? k.n : "set aside"}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
