"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyBatchStepAction, askBatchAction } from "@/app/(catalog)/actions";
import { Button, Details, cx } from "@/app/(catalog)/ui";
import type { Step } from "@/lib/catalog/batch-chat";

/** Tells the grid on this page that products changed outside it, so it reads them again. */
export const REVIEW_CHANGED = "snaben:review-changed";

interface Turn { role: "user" | "assistant"; content: string; steps?: Array<Step & { state: "open" | "done" | "skipped" | "failed"; note?: string }> }

/**
 * Ask about the batch in plain words: which products have no picture, tag every Osprey pack
 * Hiking, set the jackets to draft, drop the display stands, find pages for the ones without.
 * A question is answered with the products it is about; a request comes back as steps, each a
 * sentence naming what it touches, and nothing changes until Apply is pressed on it.
 */
export function AskBatch({ batchId, titles, aiEnabled, locked }: { batchId: string; titles: Record<string, string>; aiEnabled: boolean; locked: boolean }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const ask = () => {
    const content = text.trim();
    if (!content || pending) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next); setText(""); setError("");
    start(async () => {
      const r = await askBatchAction(batchId, next.map((t) => ({ role: t.role, content: t.content })));
      if (!r.ok || !r.data) return setError(r.ok ? "No answer." : r.error);
      setTurns([...next, { role: "assistant", content: r.data.reply, steps: r.data.steps.map((s) => ({ ...s, state: s.op.kind === "show" ? "done" as const : "open" as const })) }]);
    });
  };
  const mark = (ti: number, si: number, state: "done" | "skipped" | "failed", note?: string) => setTurns((ts) => ts.map((t, i) => (i !== ti || !t.steps ? t : { ...t, steps: t.steps.map((s, j) => (j === si ? { ...s, state, note } : s)) })));
  const apply = (ti: number, si: number) => {
    const s = turns[ti].steps?.[si];
    if (!s) return;
    start(async () => {
      const r = await applyBatchStepAction(batchId, s.op);
      if (r.ok) { mark(ti, si, "done"); window.dispatchEvent(new Event(REVIEW_CHANGED)); router.refresh(); } else mark(ti, si, "failed", r.error);
    });
  };
  const idsOf = (s: Step) => (s.op.kind === "retitle" ? [s.op.productId] : s.op.productIds);

  return (
    <Details summary="Ask about this batch" hint={aiEnabled ? "a question, or a change to make" : "needs a reading key"} className="mb-4">
      <div className="space-y-3">
        <p className="text-[13.5px] text-[var(--ink-soft)]">&ldquo;Which of these have no picture?&rdquo; &ldquo;Tag every Osprey pack Hiking.&rdquo; &ldquo;Set the jackets to draft.&rdquo; A question is answered with the products it is about; a change comes back as steps, and nothing changes until you apply one.</p>
        {turns.length > 0 && (
          <ol className="space-y-2">
            {turns.map((t, ti) => (
              <li key={ti} className={cx("rounded-[12px] px-4 py-3 text-[14px]", t.role === "user" ? "ml-8 bg-[var(--meta-tint)]" : "mr-8 border border-[var(--line)] bg-white")}>
                <p className="whitespace-pre-wrap leading-relaxed">{t.content}</p>
                {t.steps && t.steps.length > 0 && (
                  <ul className="mt-3 divide-y divide-[var(--line-soft)] rounded-[10px] border border-[var(--line)]">
                    {t.steps.map((s, si) => (
                      <li key={si} className={cx("px-3 py-2", s.state === "skipped" && "opacity-60")}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className={cx("min-w-0 flex-1 text-[13.5px] leading-relaxed", s.state === "skipped" && "line-through")}>{s.sentence}</span>
                          <span className="flex shrink-0 items-center gap-2 text-[12.5px]">
                            {s.op.kind !== "show" && s.state === "open" && <><Button size="sm" variant="primary" disabled={pending || locked} onClick={() => apply(ti, si)}>Apply</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => mark(ti, si, "skipped")}>Skip</Button></>}
                            {s.op.kind !== "show" && s.state === "done" && <span className="font-semibold text-[var(--promoter)]">Done</span>}
                            {s.state === "failed" && <span className="text-[var(--danger)]">{s.note ?? "Could not be applied"}</span>}
                          </span>
                        </div>
                        <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{idsOf(s).slice(0, 8).map((id) => titles[id] ?? id).join("; ")}{idsOf(s).length > 8 ? `; and ${idsOf(s).length - 8} more` : ""}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
        {pending && <p className="text-[13px] text-[var(--ink-soft)]">Working…</p>}
        {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
        {locked && <p className="text-[12.5px] text-[var(--ink-soft)]">This batch has been exported, so steps can be read but not applied.</p>}
        <div className="flex items-end gap-2">
          <textarea className="input min-h-[56px] flex-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!aiEnabled || pending} placeholder={aiEnabled ? "Ask, or say what to change…" : "Add a reading key on Settings to ask about a batch."} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <Button variant="primary" disabled={!aiEnabled || pending || !text.trim()} onClick={ask}>Ask</Button>
        </div>
      </div>
    </Details>
  );
}
