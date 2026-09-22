"use client";

import { useState, useTransition } from "react";
import { clearInstructionsAction, sendInstructionAction, type InstructionMessage } from "@/app/(catalog)/actions";
import { Alert, Card } from "@/app/(catalog)/ui";
import { Chat } from "@/app/(catalog)/Chat";

/**
 * What is true about this invoice, said before it is read.
 *
 * "This is an Oakley closeout, everything needs the 2998 tag and it is all 30% off" is a real fact
 * about a document that no column on it states. What it was understood to mean is listed beside the
 * conversation, so a batch always shows what it is being built under.
 */
export function InstructionChat({
  batchId,
  initial,
  directives,
  aiEnabled,
  locked,
}: {
  batchId: string;
  initial: InstructionMessage[];
  directives: string[];
  aiEnabled: boolean;
  locked: boolean;
}) {
  const [turns, setTurns] = useState(initial);
  const [inForce, setInForce] = useState(directives);
  const [pending, start] = useTransition();

  return (
    <Card title="About this invoice">
      <p className="mb-3 text-sm text-[var(--ink-2)]">
        Anything true of the whole invoice that it cannot read off the page — the brand, a tag every product needs, a
        closeout discount. Said here, it is applied to every product in the batch.
      </p>

      {inForce.length > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--gold)] bg-[#fffdf2] p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gold-deep)]">Building this batch with</span>
            <button
              className="text-xs text-[var(--ink-soft)] underline hover:text-[var(--ink)]"
              disabled={pending || locked}
              onClick={() => { if (confirm("Forget everything said about this invoice?")) start(async () => { const r = await clearInstructionsAction(batchId); if (r.ok) { setTurns([]); setInForce([]); } }); }}
            >
              clear
            </button>
          </div>
          <ul className="space-y-0.5 text-sm">
            {inForce.map((d) => <li key={d}>· {d}</li>)}
          </ul>
        </div>
      )}

      <Chat
        turns={turns}
        empty="Nothing said about this invoice yet."
        placeholder="e.g. this is an Oakley closeout — everything needs the 2998 tag and is 30% off"
        disabled={locked}
        notice={!aiEnabled ? <Alert tone="warning">Notes are saved, but ANTHROPIC_API_KEY is not set, so nothing will act on them.</Alert> : null}
        onSend={async (body) => {
          const r = await sendInstructionAction(batchId, body);
          if (!r.ok) return r.error;
          setTurns(r.data!.messages);
          setInForce(r.data!.directives);
          return null;
        }}
      />
      {locked && <p className="mt-2 text-xs text-[var(--ink-soft)]">This batch has been exported, so it is no longer being built.</p>}
    </Card>
  );
}
