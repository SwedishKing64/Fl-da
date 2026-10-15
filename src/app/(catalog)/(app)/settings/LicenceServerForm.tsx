"use client";

import { useActionState } from "react";
import { setLicenceServerAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

/**
 * Where this copy asks for its licence. The build bakes an address in and the copy falls back to
 * the deployment's own address when that one cannot be reached; this is for the day neither is
 * right, so a shop is never stuck on "fetch failed" with nothing to do about it.
 */
export function LicenceServerForm({ servers, override }: { servers: string[]; override: string }) {
  const [state, action, pending] = useActionState(setLicenceServerAction, null);
  return (
    <details className="rounded-[10px] border border-[var(--line-soft)] p-3 text-[13px]">
      <summary className="cursor-pointer font-medium">Can&rsquo;t reach Flöda? Its address</summary>
      <p className="mt-2 text-[var(--ink-soft)]">This copy asks, in order: {servers.length ? servers.join(", then ") : "nowhere — it checks no licence"}. If none of those can be reached and you were given another address, put it here.</p>
      <ActionForm action={action} state={state} className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Flöda's address" className="min-w-[16rem] flex-1"><input name="server" className={INPUT} defaultValue={override} placeholder="https://floda.ai" autoComplete="off" /></Field>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Use this address"}</Button>
      </ActionForm>
      {state && (state.ok ? <Alert tone="success" className="mt-2">{state.message}</Alert> : <Alert tone="danger" className="mt-2">{state.error}</Alert>)}
    </details>
  );
}
