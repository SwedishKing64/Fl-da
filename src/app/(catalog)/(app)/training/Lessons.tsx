"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideLessonAction, previewLessonAction } from "@/app/(catalog)/actions";
import { PreviewLines } from "./TeachChat";
import type { Preview } from "@/lib/catalog/preview";
import { Button } from "@/app/(catalog)/ui";

export interface LessonRow { key: string; sentence: string; outcome: string; examples: string[] }

/**
 * What you keep changing on the review grid, asked back as a rule: the same word swapped three
 * times, the same tag added or taken off. Yes makes it a rule; no puts it away for good.
 */
export function Lessons({ lessons }: { lessons: LessonRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, ({ batch: string } & Preview) | null>>({});
  const preview = (key: string) =>
    start(async () => {
      const r = await previewLessonAction(key);
      if (r.ok && r.data) setPreviews((p) => ({ ...p, [key]: r.data! }));
      else setNotes((n) => ({ ...n, [key]: r.ok ? "No preview." : r.error }));
    });
  const decide = (key: string, accept: boolean) =>
    start(async () => {
      const r = await decideLessonAction(key, accept);
      setNotes((n) => ({ ...n, [key]: r.ok ? (r.data?.did ?? "Done.") : r.error }));
      if (r.ok) router.refresh();
    });
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-[var(--ink-soft)]">Each of these you have done three times or more on the review grid. Say yes and it is a rule from now on, shown below like any other; say no and it is never asked again.</p>
      <ul className="divide-y divide-[var(--line-soft)] rounded-[12px] border border-[var(--line)] bg-white">
        {lessons.map((l) => (
          <li key={l.key} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-relaxed">{l.sentence}</p>
                <p className="mt-0.5 text-[12.5px] text-[var(--ink-soft)]">Yes means: {l.outcome}{l.examples.length ? ` Seen on ${l.examples.join("; ")}.` : ""}</p>
              </div>
              {notes[l.key] ? <span className="text-[12.5px] text-[var(--ink-soft)]">{notes[l.key]}</span> : (
                <span className="flex shrink-0 gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={() => preview(l.key)}>Preview</Button><Button size="sm" variant="primary" disabled={pending} onClick={() => decide(l.key, true)}>Yes, always</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(l.key, false)}>No</Button></span>
              )}
            </div>
            {previews[l.key] && <PreviewLines preview={previews[l.key]!} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
