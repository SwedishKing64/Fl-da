"use client";

import { useState, useTransition } from "react";
import { addShopAction, openShopAction, renameShopAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import type { ShopList } from "@/lib/catalog/shops";

/**
 * The shops kept on this computer. Each is a database and files folder of its own — its own staff,
 * settings, suppliers, learning and batches — so nothing one shop does is seen by another. Opening
 * another shop restarts Flöda on it and shows that shop's sign-in. The Shop menu does the same.
 */
export function ShopsCard({ list, running }: { list: ShopList; running: string }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    setNote(null);
    const r = await work();
    setNote(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "That did not work." });
  });

  return (
    <div className="space-y-4 text-sm">
      <p className="text-[13px] text-[var(--ink-soft)]">
        Each shop keeps its own staff, settings, suppliers, what Flöda has learned and its batches. Nothing crosses between them. Opening another shop restarts Flöda on it, which takes a few seconds, and you sign in to that shop. The Shop menu at the top of the window does the same.
      </p>
      <ul className="divide-y divide-[var(--line-soft)] rounded-xl border border-[var(--line)]">
        {list.shops.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            {renaming?.id === s.id ? (
              <>
                <input id={`shop-name-${s.id}`} aria-label="Shop name" className={`${INPUT} max-w-xs`} value={renaming.name} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} />
                <Button disabled={pending || !renaming.name.trim()} onClick={() => run(async () => { const r = await renameShopAction(renaming); if (r.ok) setRenaming(null); return r; }, "Renamed.")}>Save</Button>
                <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span className="font-semibold">{s.name}</span>
                {s.id === running && <span className="rounded-full bg-[var(--meta-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--meta)]">Open now</span>}
                <span className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={() => setRenaming({ id: s.id, name: s.name })}>Rename</Button>
                  {s.id !== running && <Button disabled={pending} onClick={() => run(() => openShopAction({ id: s.id }), `Opening ${s.name}…`)}>Open</Button>}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Add a shop">
          <input id="shop-new-name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop name" maxLength={80} />
        </Field>
        <Button disabled={pending || !name.trim()} onClick={() => run(async () => { const r = await addShopAction({ name }); if (r.ok) setName(""); return r; }, `${name.trim()} added. Open it to set it up.`)}>Add</Button>
      </div>
      {note && <Alert tone={note.ok ? "success" : "warning"}>{note.text}</Alert>}
    </div>
  );
}
