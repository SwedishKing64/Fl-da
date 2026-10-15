import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Site } from "../../Shell";
import { Reveal } from "../../welcome/Motion";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";
import "../../welcome/welcome.css";

export const metadata: Metadata = { title: "Flöda billing", description: "Back from Stripe." };

const OUTCOMES = {
  paid: {
    eyebrow: "Paid",
    title: "Thank you. Your plan is on.",
    lede: "Stripe has told Flöda, and your copy will see it the next time it checks its key. Go back to Flöda and press “Check the key” under Settings → Licence to see it now rather than tomorrow.",
  },
  cancelled: {
    eyebrow: "Not paid",
    title: "Nothing was charged.",
    lede: "You left the payment page before paying. Your copy is exactly as it was; pick a plan again in Flöda whenever you like, or write to us.",
  },
  "portal-done": {
    eyebrow: "Billing",
    title: "Back from your billing page.",
    lede: "Anything you changed there reaches your copy the next time it checks its key. Press “Check the key” under Settings → Licence to see it now.",
  },
} as const;

/** Where Stripe sends a person after paying, after leaving without paying, or after the billing page. */
export default async function BillingOutcomePage({ params }: { params: Promise<{ outcome: string }> }) {
  const { outcome } = await params;
  const copy = OUTCOMES[outcome as keyof typeof OUTCOMES];
  if (!copy) notFound();
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p className="lede">{copy.lede}</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap prose">
          <Reveal><p>You can close this tab. Questions about an invoice or a plan go to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>; the <Link href="/terms">terms</Link> say what a plan includes and how cancelling works.</p></Reveal>
        </div>
      </section>
    </Site>
  );
}
