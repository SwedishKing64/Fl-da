"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportRulesAction, importRulesAction } from "@/app/(catalog)/actions";
import { Alert, Button } from "@/app/(catalog)/ui";

/**
 * Everything Flöda has been taught, as one file: downloaded to keep or to send to Flöda support,
 * and loaded back when support sends it with the rules fixed. Loading replaces each section the
 * file carries and backs the database up first.
 */
export function RulesFile() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const download = () =>
    start(async () => {
      setNote(null);
      const r = await exportRulesAction();
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      const blob = new Blob([r.data!.json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.data!.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setNote({ tone: "info", text: `Downloaded ${r.data!.filename}. Keep it, or send it to Flöda support with what is wrong.` });
    });

  const load = (file: File) =>
    start(async () => {
      setNote(null);
      const json = await file.text();
      if (!confirm(`Load ${file.name}? Each part it carries replaces what is here; the database is backed up first.`)) return;
      const r = await importRulesAction({ json });
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      setNote({ tone: "success", text: `Loaded: ${r.data!.loaded}.` });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" disabled={pending} onClick={download} title="Everything on this page as one file: to keep, or to send to Flöda support">Download your rules</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => input.current?.click()} title="A rules file from Flöda support, or one you downloaded earlier">Load a rules file</Button>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void load(f); }} />
      {note && <Alert tone={note.tone} className="basis-full">{note.text}</Alert>}
    </div>
  );
}
