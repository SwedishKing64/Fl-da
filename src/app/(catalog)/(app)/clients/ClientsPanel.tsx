"use client";

import { useActionState, useState, useTransition } from "react";
import { clientFromLeadAction, createClientAction, deleteClientAction, dismissFeedbackAction, dismissLeadAction, regenerateClientKeyAction, updateClientAction } from "@/app/(catalog)/actions";
import type { FeedbackRow } from "@/lib/catalog/feedback-box";
import { Alert, Badge, Button, Empty, Field, INPUT, fmtDate } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

export interface ClientRow {
  id: string; name: string; contact: string; email: string; plan: string; status: string; licenceKey: string; notes: string;
  /** This month's reading through Flöda, in a line, and the allowance in dollars for the form. */
  reading: string; readingExhausted: boolean; aiCap: string;
  expiresAt: string | null; lastSeenAt: string | null; lastVersion: string; lastInstall: string; checkIns: number; createdAt: string;
}
export interface LeadRow { email: string; shop: string; sells: string; platform: string; note: string; at: string }

const TONE: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = { ACTIVE: "success", TRIAL: "info", PAUSED: "warning", ENDED: "neutral" };
const STATUS_WORD: Record<string, string> = { ACTIVE: "active", TRIAL: "on trial", PAUSED: "paused", ENDED: "ended" };

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function Row({ c }: { c: ClientRow }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const act = (work: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await work(); setNote(r.ok ? (r.message ?? "Saved") : r.error ?? "Something went wrong"); });
  const copy = () => { void navigator.clipboard?.writeText(c.licenceKey); setNote("Key copied."); };
  const seen = c.lastSeenAt ? `${fmtDate(c.lastSeenAt)}${c.lastVersion ? ` · v${c.lastVersion}` : ""}` : "never";
  return (
    <>
      <tr className="border-t border-[var(--line-soft)] align-top">
        <td className="py-2 pr-3">
          <div className="font-semibold">{c.name || <span className="text-[var(--ink-soft)]">(unnamed)</span>}</div>
          <div className="text-xs text-[var(--ink-soft)]">{[c.contact, c.email].filter(Boolean).join(" · ")}</div>
        </td>
        <td className="py-2 pr-3"><Badge tone={TONE[c.status] ?? "neutral"}>{STATUS_WORD[c.status] ?? c.status}</Badge><div className="mt-1 text-xs text-[var(--ink-soft)]">{c.plan}{c.expiresAt ? ` · until ${fmtDate(c.expiresAt)}` : ""}</div></td>
        <td className="py-2 pr-3 font-mono text-xs"><button type="button" onClick={copy} title="Copy" className="rounded px-1 hover:bg-[var(--meta-tint)]">{c.licenceKey}</button></td>
        <td className="py-2 pr-3 text-xs text-[var(--ink-soft)]">{seen}{c.checkIns > 0 && <div>{c.checkIns} check-in{c.checkIns === 1 ? "" : "s"}</div>}</td>
        <td className={`py-2 pr-3 text-xs ${c.readingExhausted ? "text-[var(--danger-ink,#b42318)]" : "text-[var(--ink-soft)]"}`}>{c.reading}</td>
        <td className="py-2 text-right whitespace-nowrap">
          {c.status === "TRIAL" && <Button size="sm" disabled={pending} onClick={() => act(() => updateClientAction(c.id, { status: "ACTIVE", expiresAt: "" }))}>Make active</Button>}
          {c.status === "ACTIVE" && <Button size="sm" disabled={pending} onClick={() => act(() => updateClientAction(c.id, { status: "PAUSED" }))}>Pause</Button>}
          {c.status === "PAUSED" && <Button size="sm" disabled={pending} onClick={() => act(() => updateClientAction(c.id, { status: "ACTIVE" }))}>Resume</Button>}
          <Button size="sm" variant="ghost" className="ml-1" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</Button>
        </td>
      </tr>
      {(note || open) && (
        <tr className="align-top">
          <td colSpan={6} className="pb-3">
            {note && <div className="mb-2 text-xs text-[var(--meta-ink)]">{note}</div>}
            {open && (
              <form
                className="grid gap-3 rounded-[12px] bg-[var(--canvas)] p-3 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  act(() => updateClientAction(c.id, { name: String(f.get("name") ?? ""), contact: String(f.get("contact") ?? ""), email: String(f.get("email") ?? ""), plan: String(f.get("plan") ?? ""), status: String(f.get("status") ?? ""), expiresAt: String(f.get("expiresAt") ?? ""), notes: String(f.get("notes") ?? ""), aiCap: String(f.get("aiCap") ?? "") }));
                }}
              >
                <Field label="Shop"><input name="name" defaultValue={c.name} className={INPUT} /></Field>
                <Field label="Contact"><input name="contact" defaultValue={c.contact} className={INPUT} /></Field>
                <Field label="Email"><input name="email" defaultValue={c.email} className={INPUT} /></Field>
                <Field label="Plan"><select name="plan" defaultValue={c.plan} className={INPUT}><option value="trial">trial</option><option value="founding">founding</option><option value="standard">standard</option></select></Field>
                <Field label="Standing"><select name="status" defaultValue={c.status} className={INPUT}><option value="TRIAL">on trial</option><option value="ACTIVE">active</option><option value="PAUSED">paused</option><option value="ENDED">ended</option></select></Field>
                <Field label="Until" hint="Empty for no end date."><input name="expiresAt" type="date" defaultValue={dateInput(c.expiresAt)} className={INPUT} /></Field>
                <Field label="Reading allowance a month ($)" hint="What their reading through Flöda may cost before it is turned away until next month. 0 for no limit."><input name="aiCap" inputMode="decimal" defaultValue={c.aiCap} className={INPUT} /></Field>
                <Field label="Notes" className="sm:col-span-2"><textarea name="notes" defaultValue={c.notes} rows={2} className={INPUT} /></Field>
                <div className="flex flex-wrap gap-2 sm:col-span-3">
                  <Button type="submit" variant="primary" size="sm" disabled={pending}>Save</Button>
                  <Button type="button" size="sm" disabled={pending} onClick={() => { if (confirm("Issue a new key? Their copy will have to enter it.")) act(async () => { const r = await regenerateClientKeyAction(c.id); return r.ok ? { ok: true, message: `New key: ${r.data!.key}` } : r; }); }}>New key</Button>
                  <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => { if (confirm(`Remove ${c.name || "this client"}? Their copy will be told the key is unknown.`)) act(() => deleteClientAction(c.id)); }}>Remove</Button>
                  <span className="self-center text-xs text-[var(--ink-soft)]">Added {fmtDate(c.createdAt)}{c.lastInstall ? ` · install ${c.lastInstall.slice(0, 8)}` : ""}</span>
                </div>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function NewClient() {
  const [state, action, pending] = useActionState(createClientAction, null);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
      <Field label="Shop"><input name="name" required className={INPUT} /></Field>
      <Field label="Contact"><input name="contact" className={INPUT} /></Field>
      <Field label="Email"><input name="email" type="email" className={INPUT} /></Field>
      <Field label="Plan"><select name="plan" defaultValue="founding" className={INPUT}><option value="trial">trial</option><option value="founding">founding</option><option value="standard">standard</option></select></Field>
      <Field label="Standing"><select name="status" defaultValue="ACTIVE" className={INPUT}><option value="TRIAL">on trial</option><option value="ACTIVE">active</option><option value="PAUSED">paused</option></select></Field>
      <Field label="Until" hint="Empty for no end date."><input name="expiresAt" type="date" className={INPUT} /></Field>
      {state && <div className="sm:col-span-3">{state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>}</div>}
      <div className="sm:col-span-3"><Button type="submit" variant="primary" icon="🪪" disabled={pending}>Add client and make a key</Button></div>
    </ActionForm>
  );
}

function Leads({ leads }: { leads: LeadRow[] }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  return (
    <div>
      {note && <Alert tone="success" className="mb-3">{note}</Alert>}
      {leads.length === 0 && <Empty>Nobody waiting. Retailers who register on the landing page appear here.</Empty>}
      <ul className="divide-y divide-[var(--line-soft)]">
        {leads.map((l) => (
          <li key={l.at} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{l.shop} <span className="font-normal text-[var(--ink-soft)]">· {l.email}</span></div>
              <div className="text-xs text-[var(--ink-soft)]">{[l.sells, l.platform, fmtDate(l.at)].filter(Boolean).join(" · ")}{l.note ? ` — ${l.note}` : ""}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await clientFromLeadAction(l.at); setNote(r.ok ? `${l.shop} is a client on a 30-day trial. Send them their key: ${r.data!.key}` : r.error); })}>Make a client</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Drop this lead?")) start(async () => { await dismissLeadAction(l.at); }); }}>Drop</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feedback({ rows }: { rows: FeedbackRow[] }) {
  const [pending, start] = useTransition();
  return (
    <div>
      {rows.length === 0 && <Empty>Nothing yet. What people write on the Feedback button in any copy of Flöda lands here.</Empty>}
      <ul className="divide-y divide-[var(--line-soft)]">
        {rows.map((f) => (
          <li key={f.at} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 text-sm">
              <div className="whitespace-pre-wrap">{f.message}</div>
              <div className="mt-1 text-xs text-[var(--ink-soft)]">{[f.shop || "(unnamed shop)", f.user, f.email, f.page, f.version && `v${f.version}`, fmtDate(f.at)].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="flex gap-1">
              {f.email && <a className="btn-secondary inline-flex items-center rounded-[10px] px-3 py-1.5 text-[13px] font-semibold" href={`mailto:${f.email}?subject=${encodeURIComponent("Your note to Flöda")}`}>Reply</a>}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await dismissFeedbackAction(f.at); })}>Done</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClientsPanel({ clients, leads, feedback }: { clients: ClientRow[]; leads: LeadRow[]; feedback: FeedbackRow[] }) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Clients ({clients.length})</h3>
        {clients.length === 0 ? <Empty>No clients yet. Add one below, or make one from a lead.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Shop</th><th>Standing</th><th>Key</th><th>Last seen</th><th>Reading</th><th /></tr></thead>
            <tbody>{clients.map((c) => <Row key={c.id} c={c} />)}</tbody>
          </table>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Add a client</h3>
        <NewClient />
      </section>
      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Registered interest ({leads.length})</h3>
        <Leads leads={leads} />
      </section>
      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Feedback ({feedback.length})</h3>
        <Feedback rows={feedback} />
      </section>
    </div>
  );
}
