"use client";

import { useState, useTransition } from "react";
import { applyFeedbackRuleAction, sendFeedbackAction, type FeedbackMessage } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";
import { Chat } from "@/app/(catalog)/Chat";

/**
 * What to do when the CSV is not quite right.
 *
 * Say what is wrong in plain words. The answer explains it, and where the correction holds for more
 * than this one product it comes with a rule you can add to the shop's standing instructions —
 * which is the whole point: a correction typed once should not have to be typed again.
 */
export function FeedbackChat({ batchId, initial, aiEnabled }: { batchId: string; initial: FeedbackMessage[]; aiEnabled: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const applyRule = (id: string) => {
    start(async () => {
      const r = await applyFeedbackRuleAction(id);
      if (r.ok) setMessages((m) => m.map((x) => (x.id === id ? { ...x, appliedRule: x.proposal } : x)));
      else setError(r.error);
    });
  };

  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <Card title="Something not right?">
      <p className="mb-3 text-sm text-[var(--ink-2)]">
        Tell it what the CSV got wrong — a type, a tag, a price, a title. It is taken at face value: your correction
        becomes a standing rule, in your words, and every import after this is built against it.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Chat
        turns={messages}
        empty="Nothing reported on this batch yet."
        placeholder="e.g. the Giro goggles came out as Ski Accessories — they should be Snowboard Accessories"
        notice={!aiEnabled ? <Alert tone="warning">Notes are saved, but ANTHROPIC_API_KEY is not set, so nothing will answer them or suggest a rule.</Alert> : null}
        onSend={async (body) => {
          const r = await sendFeedbackAction(batchId, body);
          if (!r.ok) return r.error;
          setMessages(r.data!.messages);
          return null;
        }}
        renderExtra={(turn) => {
          const m = byId.get(turn.id);
          return m?.proposal.trim() ? <Proposal message={m} onApply={() => applyRule(m.id)} pending={pending} /> : null;
        }}
      />
    </Card>
  );
}

function Proposal({ message, onApply, pending }: { message: FeedbackMessage; onApply: () => void; pending: boolean }) {
  const applied = Boolean(message.appliedRule.trim());
  return (
    <div className="mt-2 rounded-lg border border-[var(--gold)] bg-[#fffdf2] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gold-deep)]">
        {applied ? "Added to the standing rules" : "Add this so it does not happen again"}
      </div>
      <p className="mt-1 text-sm">{message.proposal}</p>
      {applied ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Every import from here is built against it. Edit or remove it under Templates → House rules.</p>
      ) : (
        <Button size="sm" variant="primary" className="mt-2" disabled={pending} onClick={onApply}>Add to the rules</Button>
      )}
    </div>
  );
}
