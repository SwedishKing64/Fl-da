import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Site } from "../../Shell";
import { Reveal } from "../../welcome/Motion";
import { currentAccount } from "@/lib/catalog/account";
import { isPlanId, TRIAL_DAYS } from "@/lib/catalog/plans";
import { SignUpForm } from "../AccountForms";
import "../../welcome/welcome.css";
import "../account.css";

export const metadata: Metadata = { title: "Make a Flöda account", description: "Your account starts the trial and is what you sign in to Flöda with." };
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  if (await currentAccount()) redirect("/account");
  const { plan } = await searchParams;
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Your account</span><h1>Make your account.</h1><p className="lede">It starts your {TRIAL_DAYS}-day trial, makes your licence key, and is what you sign in to Flöda with on your own computer. No card until you choose a plan.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap acct-narrow">
          <Reveal><SignUpForm plan={plan && isPlanId(plan) ? plan : "shop"} /></Reveal>
        </div>
      </section>
    </Site>
  );
}
