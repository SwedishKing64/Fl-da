import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Site } from "../Shell";
import { Reveal } from "../welcome/Motion";
import { currentAccount } from "@/lib/catalog/account";
import { verdictFor } from "@/lib/catalog/licence";
import { allowanceOf, periodEnd } from "@/lib/catalog/ai-usage";
import { describePlanSize, planOf, type PlanId } from "@/lib/catalog/plans";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";
import { AllowanceBar } from "@/app/(catalog)/AllowanceBar";
import { AccountBilling } from "./AccountForms";
import { signOutAction } from "./actions";
import "../welcome/welcome.css";
import "./account.css";

export const metadata: Metadata = { title: "Your Flöda account", description: "Your plan, your key, your reading this fortnight, and your billing." };
export const dynamic = "force-dynamic";

const STANDING: Record<string, string> = { TRIAL: "On trial", ACTIVE: "Active", PAUSED: "Paused", ENDED: "Ended" };

/** The shop's account: what it is on, how it stands, what it has read, and the money. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const client = await currentAccount();
  if (!client) redirect("/account/login");
  const { welcome } = await searchParams;
  const plan = planOf(client.plan);
  const verdict = verdictFor(client);
  const allowance = allowanceOf(client);
  const trial = client.status === "TRIAL";
  const paid = Boolean(client.stripeSubscriptionId);
  const fmt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Your account</span><h1>{client.name || "Your shop"}</h1><p className="lede">{welcome ? "Your account is made and the trial has started. " : ""}Signed in as {client.email}. <Link href="/download">Download Flöda</Link>, sign in to it with the same email and password, and it is licensed at once.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap acct-grid">
          <Reveal className="acct-card">
            <h2>Plan</h2>
            <p className="acct-big">{plan.name} <span className={`acct-pill ${client.status.toLowerCase()}`}>{STANDING[client.status] ?? client.status}</span></p>
            <p className="soft">{describePlanSize(plan)}. {plan.people}.</p>
            {verdict.ok && verdict.daysLeft !== null && <p>{trial ? "Trial ends" : "Paid to"} <b>{fmt(verdict.expiresAt)}</b>, {verdict.daysLeft} day{verdict.daysLeft === 1 ? "" : "s"} from now.</p>}
            {!verdict.ok && <p className="err">{verdict.why} Paying for a plan below opens your copy again.</p>}
            {client.billing && <p className="soft">Stripe: {client.billing}.</p>}
          </Reveal>
          <Reveal className="acct-card" delay={1}>
            <h2>Reading this fortnight</h2>
            {plan.reading === "own-key" ? (
              <p className="soft">On the Own key plan reading is billed by Anthropic to your own key, so there is no allowance here. Set the key under Settings → Reading documents in Flöda.</p>
            ) : (
              <>
                <p className="soft">Documents are read through Flöda up to the plan&rsquo;s allowance each fortnight. The bar starts again on the date shown.</p>
                <AllowanceBar spentCents={allowance.spentCents} capCents={allowance.capCents} resetsAt={periodEnd()} />
                <p className="soft" style={{ marginTop: 10 }}>{allowance.calls} reading{allowance.calls === 1 ? "" : "s"} so far. Reached the limit mid-season? Move up a plan below, or write to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.</p>
              </>
            )}
          </Reveal>
          <Reveal className="acct-card" delay={2}>
            <h2>Licence key</h2>
            <p className="soft">Signing in to Flöda with your email and password enters it for you. It is here for a copy that needs it typed.</p>
            <p className="acct-key"><code>{client.licenceKey}</code></p>
          </Reveal>
          <Reveal className="acct-card acct-wide" delay={3}>
            <h2>{paid ? "Billing" : trial ? "Choose a plan" : "Pay for a plan"}</h2>
            <AccountBilling current={plan.id as PlanId} paid={paid} trial={trial} />
          </Reveal>
          <Reveal className="acct-card acct-wide" delay={4}>
            <form action={signOutAction}><button className="btn btn-grey" type="submit">Sign out</button></form>
          </Reveal>
        </div>
      </section>
    </Site>
  );
}
