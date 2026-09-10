"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <Card>
      <ActionForm action={action} state={state} className="space-y-4">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className={INPUT} /></Field>
        <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={INPUT} /></Field>
        {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      </ActionForm>
    </Card>
  );
}
