"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { activateLicenceAction, startTrialAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { describePlanSize, PLANS, TRIAL_DAYS, type PlanId } from "@/lib/catalog/plans";

/**
 * The copy's plan: a free trial started from right here, or the key a shop already has. The
 * vendor makes the key for a trial and this copy keeps it at once, so nothing is emailed and
 * nothing is typed. Only shown on a copy that checks a licence.
 */
export function TrialStep({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"trial" | "key">("trial");
  const [plan, setPlan] = useState<PlanId>("shop");
  const [trial, startTrial, starting] = useActionState(startTrialAction, null);
  const [keyed, enterKey, entering] = useActionState(activateLicenceAction, null);
  useEffect(() => { if (trial?.ok || keyed?.ok) router.push(next); }, [trial, keyed, next, router]);

  return (
    <Card title="Your plan">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">Every plan starts with {TRIAL_DAYS} days free, no card. Pick the one sized for your month; you can change it any time, and nothing stops when a busy month runs past it.</p>
      <div className="mb-4 flex gap-2 text-[13px]">
        <button type="button" onClick={() => setMode("trial")} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "trial" ? "bg-[var(--meta)] text-white" : "bg-[var(--canvas)] text-[var(--ink-2)]"}`}>Start a free trial</button>
        <button type="button" onClick={() => setMode("key")} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "key" ? "bg-[var(--meta)] text-white" : "bg-[var(--canvas)] text-[var(--ink-2)]"}`}>I have a key</button>
      </div>

      {mode === "trial" && (
        <ActionForm action={startTrial} state={trial} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Plan">
            {PLANS.map((p) => (
              <label key={p.id} className={`cursor-pointer rounded-[14px] border p-4 transition ${plan === p.id ? "border-[var(--meta)] bg-[var(--meta-tint)] shadow-[0_0_0_3px_var(--meta-tint-2)]" : "border-[var(--line-soft)] bg-white hover:border-[var(--line)]"}`}>
                <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} className="sr-only" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">{p.name}</span>
                  <span className="text-[13px] font-semibold text-[var(--ink-2)]">${p.price}<span className="font-normal text-[var(--ink-soft)]">/mo</span></span>
                </div>
                <div className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{describePlanSize(p)}. {p.people}.</div>
                {p.founding && <div className="mt-1 text-[11.5px] font-semibold text-[var(--meta)]">Founding price, held for you</div>}
              </label>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Shop name"><input name="shop" required className={INPUT} placeholder="Alpine Sports, Jindabyne" /></Field>
            <Field label="Email for the account" hint="Where Flöda writes about the trial and the plan."><input name="email" type="email" required defaultValue={email} className={INPUT} /></Field>
          </div>
          {trial && (trial.ok ? <Alert tone="success">{trial.message}</Alert> : <Alert tone="danger">{trial.error}</Alert>)}
          <Button type="submit" variant="primary" icon="🚀" disabled={starting}>{starting ? "Starting…" : `Start the ${TRIAL_DAYS}-day trial`}</Button>
          <p className="text-[12.5px] text-[var(--ink-soft)]">After the trial, {PLANS.find((p) => p.id === plan)!.name} is ${PLANS.find((p) => p.id === plan)!.price} a month. Nothing is charged without you saying so; a person from Flöda gets in touch before it ends.</p>
        </ActionForm>
      )}

      {mode === "key" && (
        <ActionForm action={enterKey} state={keyed} className="space-y-3">
          <Field label="Licence key" hint="On the email Flöda sent you.">
            <input name="licence" className={INPUT} placeholder="FL-XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
          </Field>
          {keyed && (keyed.ok ? <Alert tone="success">{keyed.message}</Alert> : <Alert tone="danger">{keyed.error}</Alert>)}
          <Button type="submit" variant="primary" icon="🪪" disabled={entering}>{entering ? "Asking Flöda…" : "Use this key"}</Button>
        </ActionForm>
      )}
    </Card>
  );
}
