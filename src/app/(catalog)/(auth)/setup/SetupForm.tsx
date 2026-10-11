"use client";

import { useActionState } from "react";
import { setupAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, null);
  return (
    <Card title="Create the first admin account">
      <ActionForm action={action} state={state} className="space-y-4">
        <Field label="Your name"><input name="name" required className={INPUT} /></Field>
        <Field label="Email"><input name="email" type="email" required className={INPUT} /></Field>
        <Field label="Password" hint="At least 8 characters"><input name="password" type="password" minLength={8} required className={INPUT} /></Field>
        {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="primary" icon="👤" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
      </ActionForm>
    </Card>
  );
}
