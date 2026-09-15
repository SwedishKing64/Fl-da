"use client";

import { useRef, useState, useTransition } from "react";
import { applyFeedbackRuleAction, sendFeedbackAction, type FeedbackMessage } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";

/**
 * What to do when the CSV is not quite right.
 *
 * Say what is wrong in plain words. The answer explains it, and where the correction holds for more
 * than this one product it comes with a rule you can add to the shop's standing instructions —
 * which is the whole point: a correction typed once should not have to be typed again.
 */
export function FeedbackChat({ batchId, initial, aiEnabled }: { batchId: string; initial: FeedbackMessage[]; aiEnabled: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const send = () => {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    setDraft("");
    // Show it straight away; the saved thread replaces this when the answer lands.
    setMessages((m) => [...m, { id: `pending-${Date.now()}`, role: "USER", body, proposal: "", appliedRule: "", createdAt: new Date().toISOString() }]);
    start(async () => {
      const r = await sendFeedbackAction(batchId, body);
      if (r.ok) setMessages(r.data!.messages);
      else {
        setError(r.error);
        setDraft(body);
        setMessages((m) => m.filter((x) => !x.id.startsWith("pending-")));
      }
      requestAnimationFrame(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" }));
    });
  };

  const applyRule = (id: string) => {
    start(async () => {
      const r = await applyFeedbackRuleAction(id);
      if (r.ok) setMessages((m) => m.map((x) => (x.id === id ? { ...x, appliedRule: x.proposal } : x)));
      else setError(r.error);
    });
  };

  return (
    <Card title="Something not right?">
      <p className="mb-3 text-sm text-[var(--ink-2)]">
        Tell it what the CSV got wrong — a type, a tag, a price, a title. Where the correction holds for more than this one
        product you can add it to the standing rules, and every import after this is built against it.
      </p>

      <div ref={boxRef} className="mb-3 max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-6 text-center text-sm text-[var(--ink-soft)]">
            Nothing reported on this batch yet.
          </p>
        )}
        {messages.map((m) => (m.role === "USER" ? <Said key={m.id} body={m.body} /> : <Answered key={m.id} message={m} onApply={() => applyRule(m.id)} pending={pending} />))}
        {pending && <div className="shimmer h-10 rounded-lg" aria-label="Thinking about it" />}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {!aiEnabled && <Alert tone="warning">Notes are saved, but ANTHROPIC_API_KEY is not set, so nothing will answer them or suggest a rule.</Alert>}

      <div className="flex items-end gap-2">
        <textarea
          id="feedback-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          rows={2}
          placeholder="e.g. the Giro goggles came out as Ski Accessories — they should be Snowboard Accessories"
          className="min-h-[46px] flex-1 resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--alp-sky)] focus:ring-2 focus:ring-[var(--alp-sky)]/25"
        />
        <Button variant="primary" onClick={send} disabled={pending || !draft.trim()}>{pending ? "Sending…" : "Send"}</Button>
      </div>
      <p className="mt-1 text-[11px] text-[var(--ink-soft)]">⌘/Ctrl + Enter sends.</p>
    </Card>
  );
}

function Said({ body }: { body: string }) {
  return (
    <div className="rise flex justify-end">
      <p className="alp-gradient max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white shadow-[var(--shadow-sm)]">{body}</p>
    </div>
  );
}

function Answered({ message, onApply, pending }: { message: FeedbackMessage; onApply: () => void; pending: boolean }) {
  const applied = Boolean(message.appliedRule.trim());
  return (
    <div className="rise max-w-[85%]">
      <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-[var(--line)] bg-[var(--alp-snow)] px-3 py-2 text-sm text-[var(--ink)]">{message.body}</p>
      {message.proposal.trim() && (
        <div className="mt-2 rounded-lg border border-[var(--alp-yellow)] bg-[#fffdf2] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--alp-yellow-deep)]">
            {applied ? "Added to the standing rules" : "Add this so it does not happen again"}
          </div>
          <p className="mt-1 text-sm text-[var(--ink)]">{message.proposal}</p>
          {applied ? (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">Every import from here is built against it. Edit or remove it under Templates → House rules.</p>
          ) : (
            <Button size="sm" variant="primary" className="mt-2" disabled={pending} onClick={onApply}>Add to the rules</Button>
          )}
        </div>
      )}
    </div>
  );
}
