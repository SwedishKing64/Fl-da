"use client";

import { useActionState } from "react";
import { activateLicenceAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import type { LicenceState } from "@/lib/catalog/licence";

/** The key Flöda sent the shop, and what Flöda last said about it. */
export function LicenceForm({ state }: { state: LicenceState }) {
  const [result, action, pending] = useActionState(activateLicenceAction, null);
  return (
    <ActionForm action={action} state={result} className="space-y-3">
      {state.kind === "ok" && (
        <Alert tone="success">
          Licensed to <strong>{state.licence.client}</strong> ({state.licence.plan}{state.licence.status === "TRIAL" ? ", trial" : ""}){state.daysLeft !== null ? `, ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left` : ""}.
          {state.stale ? " Flöda has not been reached lately; it will be asked again." : ""}
        </Alert>
      )}
      {state.kind === "lapsed" && <Alert tone="warning">{state.why} Everything keeps working while it is sorted out.</Alert>}
      {state.kind === "none" && <Alert tone="info">No key has been entered yet.</Alert>}
      <Field label="Licence key" hint="On the email Flöda sent you. Entering it asks Flöda whether this copy may run, and about once a day after that.">
        <input name="licence" className={INPUT} placeholder="FL-XXXX-XXXX-XXXX-XXXX" defaultValue={state.kind === "ok" || state.kind === "lapsed" ? state.licence.key : ""} autoComplete="off" />
      </Field>
      {result && (result.ok ? <Alert tone="success">{result.message}</Alert> : <Alert tone="danger">{result.error}</Alert>)}
      <Button type="submit" variant="primary" icon="🪪" disabled={pending}>{pending ? "Asking Flöda…" : "Check the key"}</Button>
    </ActionForm>
  );
}
