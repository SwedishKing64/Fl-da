"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSkippedProductsAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";

/**
 * Which of the invoice's products go to the shop.
 *
 * An order seldom arrives with everything on it wanted as a listing: a binding ordered to go on
 * skis, a size run of socks nobody lists, a product already on the shelf under another name. Each
 * built product is a tick here; unticking it takes it out of the batch and is remembered, so a
 * build run again leaves it out. Ticking it back builds it again.
 */
interface Row { title: string; handle: string }

export function BuildList({ batchId, built, skipped, locked }: { batchId: string; built: Row[]; skipped: string[]; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [open, setOpen] = useState(true);

  const change = (skip: string[]) => start(async () => {
    const r = await setSkippedProductsAction(batchId, skip);
    if (!r.ok) { setSaid({ tone: "danger", text: r.error }); return; }
    setSaid(r.data!.said ? { tone: "info", text: r.data!.said } : null);
    router.refresh();
  });

  if (built.length === 0 && skipped.length === 0) return null;
  const total = built.length + skipped.length;

  return (
    <Card
      className="mb-4"
      title={<>Products to build <span className="font-normal text-[var(--ink-soft)]">· {built.length} of {total}{skipped.length > 0 ? ` · ${skipped.length} left out` : ""}</span></>}
      actions={<>
        {!locked && skipped.length > 0 && <Button size="sm" disabled={pending} onClick={() => change([])}>Build all of them</Button>}
        <Button size="sm" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</Button>
      </>}
    >
      <p className="mb-3 text-xs text-[var(--ink-soft)]">Untick a product and it is left out of this batch; tick it again and it is built back in. The choice is kept with the batch, so building again keeps it.</p>
      {said && <Alert tone={said.tone} className="mb-3">{said.text}</Alert>}
      {open && (
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {built.map((p) => (
            <li key={p.handle}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked disabled={locked || pending} onChange={() => change([...skipped, p.handle])} />
                <span>{p.title}</span>
              </label>
            </li>
          ))}
          {skipped.map((s) => (
            <li key={`skip-${s}`}>
              <label className="flex items-start gap-2 text-sm text-[var(--ink-soft)]">
                <input type="checkbox" className="mt-1" checked={false} disabled={locked || pending} onChange={() => change(skipped.filter((x) => x !== s))} />
                <span className="line-through decoration-[var(--line)]">{s}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
