"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backupNowAction, restoreBackupAction, sendBackupToSupportAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT, fmtDate } from "@/app/(catalog)/ui";
import type { Backup } from "@/lib/catalog/backup";

const REASON: Record<Backup["reason"], string> = { manual: "by hand", nightly: "nightly", restore: "before a restore" };

/**
 * The copies of this copy's database: when, how big, and the three things to do with one.
 * Everything the shop has taught Flöda is in that file, so the card says where it is and that a
 * copy somewhere else — a drive, a cloud folder — is the shop's to keep.
 */
export function Backups({ backups, db, dir, canSend }: { backups: Backup[]; db: string; dir: string; canSend: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [supportNote, setSupportNote] = useState("");
  const [email, setEmail] = useState("");
  const newest = backups[0];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--ink-soft)]">Everything Flöda has learned, every supplier layout and every batch is in one file on this machine: <span className="mono text-xs">{db}</span>. It is copied once a night while Flöda is open, and the newest fourteen copies are kept in <span className="mono text-xs">{dir}</span>. A copy somewhere else — a drive, a cloud folder — is what survives this machine. Uploaded pictures sit in the files folder beside it.</p>
      <Alert tone={newest ? "success" : "warning"}>{newest ? `Last backed up ${fmtDate(newest.at)} (${REASON[newest.reason]}, ${(newest.bytes / 1024 / 1024).toFixed(1)} MB).` : "No backup yet. One is made tonight, or now with the button."}</Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="💾" disabled={pending} onClick={() => start(async () => { const r = await backupNowAction(); setNote(r.ok ? { tone: "success", text: r.message ?? "Backed up." } : { tone: "danger", text: r.error }); router.refresh(); })}>{pending ? "Working…" : "Back up now"}</Button>
        {newest && <a href={`/api/catalog/backups/${newest.name}`} className="inline-flex items-center rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">Download the latest</a>}
      </div>
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
      {canSend && (
        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--canvas)] p-4">
          <div className="text-[14px] font-semibold">Something wrong that you cannot fix here?</div>
          <p className="mt-1 text-[13px] text-[var(--ink-soft)]">Send a copy of this database to Flöda support. Someone at Flöda opens it in a copy of their own, finds what is wrong, and sends you a rules file back to load on Teach Flöda. The copy holds everything this shop has taught Flöda and every batch, costs included; pictures are not sent.</p>
          {sending ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="What is wrong" className="sm:col-span-2"><textarea className={`${INPUT} min-h-[5rem]`} value={supportNote} onChange={(e) => setSupportNote(e.target.value)} placeholder="The Trek order built every size as its own product, batch of 12 October." /></Field>
              <Field label="Email to reply to"><input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.com.au" /></Field>
              <div className="flex items-end gap-2">
                <Button variant="primary" disabled={pending || supportNote.trim().length < 3} onClick={() => start(async () => { setNote(null); const r = await sendBackupToSupportAction({ note: supportNote, email }); if (!r.ok) return setNote({ tone: "danger", text: r.error }); setSending(false); setSupportNote(""); setNote({ tone: "success", text: `Sent: ${(r.data!.bytes / 1024 / 1024).toFixed(1)} MB went to Flöda support. A person will write back${email.trim() ? ` to ${email.trim()}` : ""}.` }); router.refresh(); })}>{pending ? "Sending…" : "Send it"}</Button>
                <Button variant="ghost" disabled={pending} onClick={() => setSending(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3" size="sm" disabled={pending} onClick={() => setSending(true)}>Send a copy to Flöda support</Button>
          )}
        </div>
      )}
      {backups.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-left text-[var(--ink-soft)]"><tr><th className="py-1 pr-3">When</th><th className="pr-3">Why</th><th className="pr-3 text-right">Size</th><th /></tr></thead>
          <tbody>
            {backups.slice(0, 8).map((b) => (
              <tr key={b.name} className="border-t border-[var(--line-soft)]">
                <td className="py-1 pr-3">{fmtDate(b.at)}</td>
                <td className="pr-3">{REASON[b.reason]}</td>
                <td className="pr-3 text-right tabular-nums">{(b.bytes / 1024 / 1024).toFixed(1)} MB</td>
                <td className="text-right">
                  <a href={`/api/catalog/backups/${b.name}`} className="mr-3 underline">Download</a>
                  <button className="underline" disabled={pending} onClick={() => { if (confirm(`Put the database back as it was at ${fmtDate(b.at)}? What is there now is backed up first. Restart Flöda afterwards.`)) start(async () => { const r = await restoreBackupAction(b.name); setNote(r.ok ? { tone: "warning", text: r.message ?? "Restored." } : { tone: "danger", text: r.error }); router.refresh(); }); }}>Restore</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
