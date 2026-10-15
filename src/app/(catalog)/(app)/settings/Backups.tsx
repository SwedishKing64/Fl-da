"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backupNowAction, restoreBackupAction } from "@/app/(catalog)/actions";
import { Alert, Button, fmtDate } from "@/app/(catalog)/ui";
import type { Backup } from "@/lib/catalog/backup";

const REASON: Record<Backup["reason"], string> = { manual: "by hand", nightly: "nightly", restore: "before a restore" };

/**
 * The copies of this copy's database: when, how big, and the three things to do with one.
 * Everything the shop has taught Flöda is in that file, so the card says where it is and that a
 * copy somewhere else — a drive, a cloud folder — is the shop's to keep.
 */
export function Backups({ backups, db, dir }: { backups: Backup[]; db: string; dir: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
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
