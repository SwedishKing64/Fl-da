"use client";

import { useActionState, useState, useTransition } from "react";
import { createUserAction, deleteUserAction, saveSettingsAction } from "@/app/catalog/actions";
import { Alert, Button, Field, INPUT } from "@/app/catalog/ui";

export function GeneralSettingsForm({ settings, aiConfigured }: { settings: { publicBaseUrl: string; seoTone: string }; aiConfigured: boolean }) {
  const [form, setForm] = useState(settings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-3">
      <Field label="Public base URL" hint="Where this app is reachable from the internet, e.g. https://importer.yourshop.com.au. Uploaded images are served from here so Shopify can fetch them."><input value={form.publicBaseUrl} onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })} className={INPUT} placeholder="https://" /></Field>
      <Field label="Tone for AI-written descriptions"><textarea rows={3} value={form.seoTone} onChange={(e) => setForm({ ...form, seoTone: e.target.value })} className={INPUT} /></Field>
      <Alert tone={aiConfigured ? "success" : "warning"}>{aiConfigured ? "ANTHROPIC_API_KEY is set: PDF/image extraction and AI copywriting are enabled." : "ANTHROPIC_API_KEY is not set. CSV/XLSX imports and template copy still work; PDFs use pattern matching and images cannot be read."}</Alert>
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
      <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveSettingsAction({ publicBaseUrl: form.publicBaseUrl.trim().replace(/\/+$/, ""), seoTone: form.seoTone }); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); })}>Save</Button>
    </div>
  );
}

export function UserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><input name="name" required className={INPUT} /></Field>
      <Field label="Email"><input name="email" type="email" required className={INPUT} /></Field>
      <Field label="Password"><input name="password" type="password" minLength={8} required className={INPUT} /></Field>
      <Field label="Role"><select name="role" defaultValue="STAFF" className={INPUT}><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></Field>
      {state && <div className="sm:col-span-2">{state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>}</div>}
      <div><Button type="submit" variant="primary" disabled={pending}>Add account</Button></div>
    </form>
  );
}

export function DeleteUserButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove this account?")) start(async () => { const r = await deleteUserAction(id); if (!r.ok) alert(r.error); }); }}>Remove</Button>;
}
