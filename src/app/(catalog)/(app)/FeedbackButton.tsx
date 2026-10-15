"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { sendNoteToFlodaAction } from "@/app/(catalog)/actions";
import { Button, INPUT, cx } from "@/app/(catalog)/ui";

/**
 * A word to the people who make Flöda, from any page. It goes to the vendor with the shop's name,
 * the page it was written on and the version, so a report arrives with its context on it.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = () => start(async () => {
    setError("");
    const r = await sendNoteToFlodaAction({ message, email, page: pathname });
    if (!r.ok) { setError(r.error ?? "It could not be sent."); return; }
    setSent(r.message ?? "Sent. Thank you.");
    setMessage("");
  });

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div className="w-[min(360px,calc(100vw-40px))] rounded-[18px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow)]" role="dialog" aria-label="Feedback">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-bold">Tell us what you think</div>
              <div className="text-[12.5px] text-[var(--ink-soft)]">A bug, a wrong listing, something you wish it did. It reaches a person.</div>
            </div>
            <button type="button" className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--canvas-2)]" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          {sent ? (
            <div className="rounded-[12px] bg-[var(--promoter-tint)] px-3 py-2.5 text-[13.5px] text-[#0b5e43]">{sent} <button type="button" className="ml-1 font-semibold underline" onClick={() => setSent("")}>Write another</button></div>
          ) : (
            <div className="space-y-2.5">
              <textarea ref={box} className={cx(INPUT, "min-h-[110px] text-[14px]")} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What happened, and what you expected…" maxLength={4000} />
              <input className={cx(INPUT, "text-[14px]")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email, if you would like a reply" autoComplete="email" />
              {error && <div className="text-[13px] text-[var(--detractor)]">{error}</div>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-[var(--ink-soft)]">Sent with the page you are on and the version.</span>
                <Button size="sm" variant="primary" disabled={pending || message.trim().length < 3} onClick={send}>{pending ? "Sending…" : "Send"}</Button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx("btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold", open && "opacity-90")}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4.2 3.4A.5.5 0 0 1 4 19z" /><path d="M8 9h8M8 12.5h5" /></svg>
        Feedback
      </button>
    </div>
  );
}
