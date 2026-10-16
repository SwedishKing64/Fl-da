"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { accountCheckoutAction, accountPlanAction, accountPortalAction, signInAction, signUpAction, type AccountResult } from "./actions";
import { PLANS, TRIAL_DAYS, describePlanSize, per, type PlanId } from "@/lib/catalog/plans";

/** React clears a plain form once its action returns, wrong password and all; these keep what was typed. */
export function SignUpForm({ plan: initial }: { plan: PlanId }) {
  const [result, act, pending] = useActionState(signUpAction, null);
  const [plan, setPlan] = useState<PlanId>(initial);
  const [shop, setShop] = useState("");
  const [email, setEmail] = useState("");
  return (
    <form action={act}>
      <label>
        Shop name
        <input name="shop" required placeholder="Alpine Sports, Jindabyne" value={shop} onChange={(e) => setShop(e.target.value)} />
      </label>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" placeholder="you@yourshop.com.au" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
      </label>
      <label>
        Plan
        <select name="plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
          {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} · ${p.price} {per(p)}{p.founding ? ", founding price" : ""}</option>)}
        </select>
      </label>
      <p className="soft" style={{ fontSize: 13, margin: 0 }}>{describePlanSize(PLANS.find((p) => p.id === plan)!)}. {TRIAL_DAYS} days free first, no card. You sign in to Flöda with this email and password.</p>
      {result && !result.ok && <p className="err">{result.error}</p>}
      <button className="btn btn-meta" type="submit" disabled={pending}>{pending ? "Making your account…" : "Make the account and start the trial"}</button>
      <p className="soft" style={{ fontSize: 13 }}>Already have one? <Link href="/account/login">Sign in</Link>. By making an account you agree to the <Link href="/terms">terms</Link>.</p>
    </form>
  );
}

export function SignInForm() {
  const [result, act, pending] = useActionState(signInAction, null);
  const [email, setEmail] = useState("");
  return (
    <form action={act}>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      {result && !result.ok && <p className="err">{result.error}</p>}
      <button className="btn btn-meta" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="soft" style={{ fontSize: 13 }}>No account yet? <Link href="/account/signup">Make one</Link>; it starts the {TRIAL_DAYS}-day trial.</p>
    </form>
  );
}

/** The plan and the money, on the account page. */
export function AccountBilling({ current, paid, trial }: { current: PlanId; paid: boolean; trial: boolean }) {
  const [note, setNote] = useState<AccountResult | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const go = (what: "checkout" | "portal" | "plan", plan?: PlanId) =>
    start(async () => {
      setBusy(plan ?? what);
      setNote(null);
      const r = what === "checkout" ? await accountCheckoutAction(plan!) : what === "portal" ? await accountPortalAction() : await accountPlanAction(plan!);
      setBusy("");
      if (r.ok && r.url) { window.location.href = r.url; return; }
      setNote(r);
    });
  return (
    <div className="acct-billing">
      {paid ? (
        <>
          <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => go("portal")}>{busy === "portal" ? "Opening…" : "Card, plan and invoices"}</button>
          <p className="soft" style={{ fontSize: 13 }}>Stripe&rsquo;s billing page: change the card or the plan, download invoices, or cancel. Your copy sees a change the next time it checks its key.</p>
        </>
      ) : (
        <>
          <div className="acct-plans">
            {PLANS.map((p) => (
              <div key={p.id} className={`acct-plan${p.id === current ? " on" : ""}`}>
                <div className="acct-plan-head"><b>{p.name}</b><span>${p.price} <small>{per(p)}</small></span></div>
                <p>{describePlanSize(p)}. {p.people}.</p>
                <div className="acct-plan-actions">
                  <button className="btn btn-meta" type="button" disabled={pending} onClick={() => go("checkout", p.id)}>{busy === p.id ? "Opening…" : "Pay for this plan"}</button>
                  {trial && p.id !== current && <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => go("plan", p.id)}>Switch the trial to it</button>}
                </div>
              </div>
            ))}
          </div>
          <p className="soft" style={{ fontSize: 13 }}>Paid on Stripe in advance, Own key monthly and the rest every two weeks. Cancel any time; the period paid for runs out before anything stops.</p>
        </>
      )}
      {note && <p className={note.ok ? "soft" : "err"}>{note.ok ? note.message : note.error}</p>}
    </div>
  );
}
