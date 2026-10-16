"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { activateLicenceAction, signInLicenceAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { LicenceServerForm } from "@/app/(catalog)/(app)/settings/LicenceServerForm";
import { TRIAL_DAYS } from "@/lib/catalog/plans";

/**
 * The copy's licence: sign in with the account made on Flöda's website, which hands this copy
 * its key, or type a key a shop already has. The trial and the plan are chosen on the website
 * when the account is made; nothing is started from here. Only shown on a copy that checks a
 * licence.
 */
export function SignInStep({ email, next, site, servers, override }: { email: string; next: string; site: string; servers: string[]; override: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"account" | "key">("account");
  const [signed, signIn, signing] = useActionState(signInLicenceAction, null);
  const [keyed, enterKey, entering] = useActionState(activateLicenceAction, null);
  useEffect(() => { if (signed?.ok || keyed?.ok) router.push(next); }, [signed, keyed, next, router]);
  const signup = `${site}/account/signup`;

  return (
    <Card title="Your Flöda account">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Flöda is used with an account made on its website. Making one starts the {TRIAL_DAYS}-day trial, no card, and picks a plan; signing in here licenses this copy. No account yet? <a href={signup} target="_blank" rel="noreferrer" className="font-semibold text-[var(--meta)] underline">Make one at {site.replace(/^https?:\/\//, "")}/account/signup</a>, then come back and sign in.
      </p>
      <div className="mb-4 flex gap-2 text-[13px]">
        <button type="button" onClick={() => setMode("account")} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "account" ? "bg-[var(--meta)] text-white" : "bg-[var(--canvas)] text-[var(--ink-2)]"}`}>Sign in with my account</button>
        <button type="button" onClick={() => setMode("key")} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "key" ? "bg-[var(--meta)] text-white" : "bg-[var(--canvas)] text-[var(--ink-2)]"}`}>I have a key</button>
      </div>

      {mode === "account" && (
        <ActionForm action={signIn} state={signed} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Email" hint="The one your account was made with."><input name="email" type="email" required defaultValue={email} autoComplete="email" className={INPUT} /></Field>
            <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={INPUT} /></Field>
          </div>
          {signed && (signed.ok ? <Alert tone="success">{signed.message}</Alert> : <Alert tone="danger">{signed.error}</Alert>)}
          <Button type="submit" variant="primary" icon="🪪" disabled={signing}>{signing ? "Signing in…" : "Sign in"}</Button>
          {signed && !signed.ok && /could not be reached/.test(signed.error) && <LicenceServerForm servers={servers} override={override} />}
          <p className="text-[12.5px] text-[var(--ink-soft)]">Your plan, your key, your reading this fortnight and your billing are on <a href={`${site}/account`} target="_blank" rel="noreferrer" className="underline">your account page</a>.</p>
        </ActionForm>
      )}

      {mode === "key" && (
        <ActionForm action={enterKey} state={keyed} className="space-y-3">
          <Field label="Licence key" hint="On your account page on the website.">
            <input name="licence" className={INPUT} placeholder="FL-XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
          </Field>
          {keyed && (keyed.ok ? <Alert tone="success">{keyed.message}</Alert> : <Alert tone="danger">{keyed.error}</Alert>)}
          <Button type="submit" variant="primary" icon="🪪" disabled={entering}>{entering ? "Asking Flöda…" : "Use this key"}</Button>
        </ActionForm>
      )}
    </Card>
  );
}
