"use client";

import { useActionState } from "react";
import { setupAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

/** The first account, which is the admin's. Nobody can sign in until it exists. */
export function AccountStep() {
  const [state, action, pending] = useActionState(setupAction, null);
  return (
    <Card title="Create your account">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">This is the admin account: it can add staff, change settings and teach Flöda about the shop. Staff accounts come later, in Settings.</p>
      <ActionForm action={action} state={state} className="space-y-4">
        <Field label="Your name"><input name="name" required className={INPUT} autoComplete="name" /></Field>
        <Field label="Email"><input name="email" type="email" required className={INPUT} autoComplete="email" /></Field>
        <Field label="Password" hint="At least 8 characters"><input name="password" type="password" minLength={8} required className={INPUT} autoComplete="new-password" /></Field>
        {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="primary" icon="👤" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create account and continue"}</Button>
      </ActionForm>
    </Card>
  );
}
