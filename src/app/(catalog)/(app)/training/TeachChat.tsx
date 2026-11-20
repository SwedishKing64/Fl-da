"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptChangeAction, previewChangeAction, teachChatAction } from "@/app/(catalog)/actions";
import type { Preview } from "@/lib/catalog/preview";
import { Button, cx } from "@/app/(catalog)/ui";
import type { Proposal } from "@/lib/catalog/teach-chat";

interface Turn { role: "user" | "assistant"; content: string; proposals?: Array<Proposal & { state: "open" | "accepted" | "declined" | "failed"; note?: string; preview?: ({ batch: string } & Preview) | null }> }

/**
 * Tell Snaben how you list, in your own words. What you say comes back as the rules it amounts
 * to, each a sentence with Accept beside it; nothing is kept until you accept it, and an accepted
 * rule appears below among the beliefs, where it can be changed or switched off like any other.
 */
export function TeachChat({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const content = text.trim();
    if (!content || pending) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setError("");
    start(async () => {
      const r = await teachChatAction(next.map((t) => ({ role: t.role, content: t.content })));
      if (!r.ok || !r.data) return setError(r.ok ? "No answer." : r.error);
      setTurns([...next, { role: "assistant", content: r.data.reply, proposals: r.data.proposals.map((p) => ({ ...p, state: "open" as const })) }]);
    });
  };

  const preview = (ti: number, pi: number) => {
    const p = turns[ti].proposals?.[pi];
    if (!p) return;
    start(async () => {
      const r = await previewChangeAction(p.change);
      setTurns((ts) => ts.map((t, i) => (i !== ti || !t.proposals ? t : { ...t, proposals: t.proposals.map((x, j) => (j === pi ? { ...x, preview: r.ok && r.data ? r.data : null, note: r.ok ? x.note : r.error } : x)) })));
    });
  };
  const decide = (ti: number, pi: number, accept: boolean) => {
    const mark = (state: "accepted" | "declined" | "failed", note?: string) => setTurns((ts) => ts.map((t, i) => (i !== ti || !t.proposals ? t : { ...t, proposals: t.proposals.map((p, j) => (j === pi ? { ...p, state, note } : p)) })));
    if (!accept) return mark("declined");
    const p = turns[ti].proposals?.[pi];
    if (!p) return;
    start(async () => {
      const r = await acceptChangeAction(p.change);
      if (r.ok) { mark("accepted"); router.refresh(); } else mark("failed", r.error);
    });
  };

  return (
    <section id="chat" className="card mb-6 scroll-mt-6">
      <header className="card-head"><h2>Tell Snaben how you list</h2><span className="text-[12.5px] text-[var(--ink-soft)]">Reading here is free</span></header>
      <div className="p-5">
        <p className="text-[14px] text-[var(--ink-soft)]">
          Say it the way you would to a new staff member: &ldquo;Osprey titles never carry the brand, and anything from Sea to Summit is filed under Camping.&rdquo; Snaben says back the rules that amounts to, each with Accept beside it. Nothing is kept until you accept it.
        </p>
        {turns.length > 0 && (
          <ol className="mt-4 space-y-3">
            {turns.map((t, ti) => (
              <li key={ti} className={cx("rounded-[12px] px-4 py-3 text-[14px]", t.role === "user" ? "ml-8 bg-[var(--meta-tint)]" : "mr-8 border border-[var(--line)] bg-white")}>
                <p className="whitespace-pre-wrap leading-relaxed">{t.content}</p>
                {t.proposals && t.proposals.length > 0 && (
                  <ul className="mt-3 divide-y divide-[var(--line-soft)] rounded-[10px] border border-[var(--line)]">
                    {t.proposals.map((p, pi) => (
                      <li key={pi} className={cx("px-3 py-2", p.state !== "open" && "opacity-70")}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className={cx("min-w-0 flex-1 text-[13.5px] leading-relaxed", p.state === "declined" && "line-through")}>{p.sentence}</span>
                        <span className="flex shrink-0 items-center gap-2 text-[12.5px]">
                          {p.state === "open" && <><Button size="sm" variant="ghost" disabled={pending} onClick={() => preview(ti, pi)}>Preview</Button><Button size="sm" variant="primary" disabled={pending} onClick={() => decide(ti, pi, true)}>Accept</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(ti, pi, false)}>Not this</Button></>}
                          {p.state === "accepted" && <span className="font-semibold text-[var(--promoter)]">Kept</span>}
                          {p.state === "declined" && <span className="text-[var(--ink-soft)]">Left out</span>}
                          {p.state === "failed" && <span className="text-[var(--danger)]">{p.note ?? "Could not be kept"}</span>}
                        </span>
                        </div>
                        {p.state === "open" && p.note && !p.preview && <p className="mt-1 text-[12.5px] text-[var(--danger)]">{p.note}</p>}
                        {p.preview && <PreviewLines preview={p.preview} />}
                      </li>
                    ))}
                  </ul>
                )}
                {t.role === "assistant" && t.proposals && t.proposals.length === 0 && <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">No rule in that; see the answer above.</p>}
              </li>
            ))}
          </ol>
        )}
        {pending && <p className="mt-3 text-[13px] text-[var(--ink-soft)]">Reading what you said…</p>}
        {error && <p className="mt-3 text-[13px] text-[var(--danger)]">{error}</p>}
        <div className="mt-4 flex items-end gap-2">
          <textarea ref={box} className="input min-h-[64px] flex-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!aiEnabled || pending} placeholder={aiEnabled ? "Tell Snaben something about how you list…" : "Add a reading key on Settings to teach by talking; Add a rule below works without one."} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button variant="primary" disabled={!aiEnabled || pending || !text.trim()} onClick={send}>Say it</Button>
        </div>
      </div>
    </section>
  );
}

/** What a change would do on the latest batch: the count, and up to three products before and after. */
export function PreviewLines({ preview }: { preview: { batch: string } & Preview }) {
  return (
    <div className="mt-1.5 rounded-[8px] bg-[var(--canvas)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink-2)]">
      <p>{preview.note}{preview.batch ? ` (${preview.batch})` : ""}</p>
      {preview.samples.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {preview.samples.map((s, i) => <li key={i}><strong>{s.title}</strong>: <del className="text-[var(--ink-soft)]">{s.before}</del> → <ins className="no-underline">{s.after}</ins></li>)}
        </ul>
      )}
    </div>
  );
}
