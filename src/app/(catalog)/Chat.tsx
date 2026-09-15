"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Alert, Button } from "@/app/(catalog)/ui";

export interface ChatTurn {
  id: string;
  role: string;
  body: string;
}

/**
 * The one conversation surface in the app.
 *
 * Both places where you talk to it — telling it about an invoice before it is read, and telling it
 * what the finished CSV got wrong — are the same thing from the outside: you type, it answers, and
 * sometimes an answer carries something to act on. They look and behave identically because they
 * are the same component.
 */
export function Chat({
  turns,
  empty,
  placeholder,
  disabled,
  notice,
  onSend,
  renderExtra,
}: {
  turns: ChatTurn[];
  empty: string;
  placeholder: string;
  disabled?: boolean;
  notice?: ReactNode;
  onSend: (body: string) => Promise<string | null>;
  renderExtra?: (turn: ChatTurn) => ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  const send = () => {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    setDraft("");
    start(async () => {
      const failed = await onSend(body);
      if (failed) {
        setError(failed);
        setDraft(body);
      }
      requestAnimationFrame(() => box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }));
    });
  };

  return (
    <div>
      <div ref={box} className="mb-3 max-h-80 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && !pending && (
          <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-6 text-center text-sm text-[var(--ink-soft)]">{empty}</p>
        )}
        {turns.map((t) =>
          t.role === "USER" ? (
            <div key={t.id} className="flex justify-end">
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--alp-blue)] px-3 py-2 text-sm text-white">{t.body}</p>
            </div>
          ) : (
            <div key={t.id} className="max-w-[85%]">
              <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-[var(--line)] bg-[var(--alp-snow)] px-3 py-2 text-sm">{t.body}</p>
              {renderExtra?.(t)}
            </div>
          ),
        )}
        {pending && <div className="shimmer h-10 w-2/3 rounded-2xl" aria-label="Working on it" />}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {notice}

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          rows={2}
          disabled={disabled}
          placeholder={placeholder}
          className="min-h-[46px] flex-1 resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--alp-sky)] focus:ring-2 focus:ring-[var(--alp-sky)]/25 disabled:bg-neutral-50"
        />
        <Button variant="primary" onClick={send} disabled={pending || disabled || !draft.trim()}>{pending ? "…" : "Send"}</Button>
      </div>
    </div>
  );
}
