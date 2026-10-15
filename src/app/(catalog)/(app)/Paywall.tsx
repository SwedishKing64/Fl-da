import Link from "next/link";
import { Logo } from "@/app/Logo";
import { logoutAction } from "@/app/(catalog)/actions";
import { LicenceForm } from "./settings/LicenceForm";
import { BillingButtons } from "./settings/BillingButtons";
import type { LicenceState } from "@/lib/catalog/licence";
import { describePlanSize, PLANS, planOf, TRIAL_DAYS } from "@/lib/catalog/plans";

/**
 * What a copy shows instead of the app when it may not run: the trial has ended, the licence
 * was paused or ended, Flöda could not be reached for a month, or no key was ever entered. The
 * shop's data is untouched behind it; a key, or a plan, opens it again. Staff see who to ask.
 */
export function Paywall({ state, isAdmin, name, servers = [], override = "" }: { state: Exclude<LicenceState, { kind: "unlicensed" | "ok" }>; isAdmin: boolean; name: string; servers?: string[]; override?: string }) {
  const lapsed = state.kind === "lapsed" ? state : null;
  const trialOver = lapsed?.licence.status === "TRIAL";
  const was = lapsed ? planOf(lapsed.licence.plan) : null;
  const title = state.kind === "none" ? "Start your free trial" : trialOver ? "Your free trial has ended" : "This copy's licence needs attention";
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="aurora relative overflow-hidden pb-24 pt-14 text-center">
        <div className="rise relative z-10 flex flex-col items-center px-4">
          <Logo size={30} tone="light" />
          <p className="mt-3 text-[13px] font-medium tracking-wide text-white/70">Paperwork in, listings out</p>
        </div>
      </header>
      <div className="rise rise-1 mx-auto -mt-12 w-full max-w-3xl px-4 pb-16">
        <div className="card p-6 md:p-8">
          <h1 className="text-[24px] font-bold tracking-[-0.02em]">{title}</h1>
          <p className="mt-2 text-[14.5px] text-[var(--ink-2)]">
            {state.kind === "none" && <>Hello {name}. Every plan starts with {TRIAL_DAYS} days free, no card. Everything the shop does in Flöda stays on this machine.</>}
            {lapsed && trialOver && <>Thanks for trying Flöda, {name}. Everything you set up and every invoice you read is still here, untouched. Pick a plan to carry on.</>}
            {lapsed && !trialOver && <>{lapsed.why} Everything is still here, untouched.</>}
          </p>

          {isAdmin ? (
            <>
              {state.kind === "none" && (
                <div className="mt-5">
                  <Link href="/setup?step=plan" className="btn btn-primary inline-flex items-center gap-2">Choose a plan and start the trial →</Link>
                </div>
              )}
              {lapsed && (
                <>
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {PLANS.map((p) => (
                      <div key={p.id} className={`rounded-[14px] border p-4 ${p.id === was?.id ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line-soft)] bg-white"}`}>
                        <div className="flex items-baseline justify-between"><span className="text-[15px] font-bold">{p.name}</span><span className="text-[13px] font-semibold">${p.price}<span className="font-normal text-[var(--ink-soft)]">/mo</span></span></div>
                        <div className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{describePlanSize(p)}. {p.people}.</div>
                        {p.id === was?.id && <div className="mt-1 text-[11.5px] font-semibold text-[var(--meta)]">What you were on</div>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <BillingButtons mode="subscribe" current={was?.id} clientName={lapsed.licence.client} licenceKey={lapsed.licence.key} />
                  </div>
                  <p className="mt-2 text-[12.5px] text-[var(--ink-soft)]">Paying opens this copy again within a minute of Stripe saying so. If you have a new key already, enter it below.</p>
                </>
              )}
              <div className="mt-6 border-t border-[var(--line-soft)] pt-5">
                <h2 className="mb-3 text-[15px] font-bold">Enter a key</h2>
                <LicenceForm state={state} use={{ invoices: 0, products: 0 }} gated servers={servers} override={override} />
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-[12px] bg-[var(--canvas)] p-4 text-[14px] text-[var(--ink-2)]">Ask your admin to pick a plan or enter the key; nothing has been lost.</div>
          )}

          <form action={logoutAction} className="mt-6">
            <button className="text-[13px] font-medium text-[var(--ink-soft)] underline">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
