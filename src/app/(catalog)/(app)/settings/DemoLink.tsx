"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { makeDemoLinkAction, revokeDemoLinkAction } from "@/app/(catalog)/actions";
import { Alert, Button } from "@/app/(catalog)/ui";

/**
 * The link that lets anyone try Flöda without signing in: shown in full, copied in one press,
 * ended in one press. The origin is the one this page was asked at, so the link is for wherever
 * this copy is being looked at.
 */
export function DemoLink({ token, origin }: { token: string; origin: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const link = token && origin ? `${origin}/demo/${token}` : "";
  return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--ink-soft)]">Anyone who opens the link is signed in as &ldquo;Demo visitor&rdquo;, a staff member, and lands on a made-up Northwind Supply order already read and built. They can do everything a staff member can on this copy, including see its other batches, so it is for a copy kept for demos. Revoking the link signs every demo visitor out.</p>
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="mono max-w-full break-all rounded-lg border border-[var(--line)] bg-neutral-50 px-3 py-2 text-xs">{link}</code>
          <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setNote({ tone: "info", text: "Copied." })); }}>Copy</Button>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">Open the demo</a>
        </div>
      ) : (
        <Alert tone="info">No demo link at the moment.</Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="🎟️" disabled={pending} onClick={() => start(async () => { const r = await makeDemoLinkAction(); setNote(r.ok ? { tone: "success", text: token ? "A new link. The old one no longer opens anything." : "The demo link is ready." } : { tone: "danger", text: r.error }); router.refresh(); })}>{token ? "Make a new link" : "Make a demo link"}</Button>
        {token && <Button variant="danger" disabled={pending} onClick={() => { if (confirm("End the demo? The link stops working and every demo visitor is signed out.")) start(async () => { const r = await revokeDemoLinkAction(); setNote(r.ok ? { tone: "success", text: "The demo is ended." } : { tone: "danger", text: r.error }); router.refresh(); }); }}>End the demo</Button>}
      </div>
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
    </div>
  );
}
