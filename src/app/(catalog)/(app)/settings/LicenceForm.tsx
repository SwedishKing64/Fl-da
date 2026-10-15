"use client";

import { useActionState } from "react";
import { activateLicenceAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { LicenceServerForm } from "./LicenceServerForm";
import { BillingButtons } from "./BillingButtons";
import type { LicenceState } from "@/lib/catalog/licence";
import { describeMonthUse, describePlanSize, overPlan, planOf, type MonthUse } from "@/lib/catalog/plans";
import { SUPPORT_EMAIL } from "@/lib/catalog/support";

/** The key Flöda sent the shop, and what Flöda last said about it. */
export function LicenceForm({ state, use, gated = false, servers = [], override = "" }: { state: LicenceState; use: MonthUse; gated?: boolean; servers?: string[]; override?: string }) {
  const [result, action, pending] = useActionState(activateLicenceAction, null);
  const plan = state.kind === "ok" ? planOf(state.licence.plan) : null;
  return (
    <>
    <ActionForm action={action} state={result} className="space-y-3">
      {state.kind === "ok" && plan && (
        <Alert tone="success">
          Licensed to <strong>{state.licence.client}</strong> on the <strong>{plan.name}</strong> plan{state.licence.status === "TRIAL" ? " (trial)" : ""}{state.daysLeft !== null ? `, ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left` : ""}. {describePlanSize(plan)}; {describeMonthUse(plan, use)}.
          {overPlan(plan, use) ? ` This month has gone past the plan. Nothing stops; write to ${SUPPORT_EMAIL} to move up.` : ""}
          {state.stale ? " Flöda has not been reached lately; it will be asked again." : ""}
        </Alert>
      )}
      {state.kind === "lapsed" && <Alert tone="warning">{state.why}{gated ? " A new key, or the plan above, opens Flöda again." : " Everything keeps working while it is sorted out."}</Alert>}
      {state.kind === "none" && <Alert tone="info">No key has been entered yet.</Alert>}
      <Field label="Licence key" hint="On the email Flöda sent you. Entering it asks Flöda whether this copy may run, and about once a day after that.">
        <input name="licence" className={INPUT} placeholder="FL-XXXX-XXXX-XXXX-XXXX" defaultValue={state.kind === "ok" || state.kind === "lapsed" ? state.licence.key : ""} autoComplete="off" />
      </Field>
      {result && (result.ok ? <Alert tone="success">{result.message}</Alert> : <Alert tone="danger">{result.error}</Alert>)}
      <Button type="submit" variant="primary" icon="🪪" disabled={pending}>{pending ? "Asking Flöda…" : "Check the key"}</Button>
    </ActionForm>
    {state.kind === "ok" && !gated && (
      <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
        <h3 className="mb-2 text-[14px] font-semibold">{state.licence.status === "TRIAL" ? "Pay for a plan" : "Billing"}</h3>
        {state.licence.status === "TRIAL" ? (
          <BillingButtons mode="subscribe" current={state.licence.plan} clientName={state.licence.client} licenceKey={state.licence.key} />
        ) : (
          <BillingButtons mode="manage" current={state.licence.plan} clientName={state.licence.client} licenceKey={state.licence.key} />
        )}
      </div>
    )}
    {servers.length > 0 && <div className="mt-3"><LicenceServerForm servers={servers} override={override} /></div>}
    </>
  );
}
