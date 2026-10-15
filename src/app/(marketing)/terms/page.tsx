import type { Metadata } from "next";
import Link from "next/link";
import { Site } from "../Shell";
import { Reveal } from "../welcome/Motion";
import { PLANS, TRIAL_DAYS } from "@/lib/catalog/plans";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";
import "../welcome/welcome.css";

export const metadata: Metadata = { title: "Flöda terms", description: "What a Flöda plan includes, how billing and cancelling work, and what each side is responsible for." };

/**
 * The terms a shop agrees to by using Flöda. Written for a shop owner, in the same voice as the
 * privacy page, and kept short: what the service is, what a plan buys, how money works, what we
 * promise and do not, and how it ends.
 */
export default function TermsPage() {
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Terms</span><h1>What you get, what it costs, and who is responsible for what.</h1><p className="lede">Written for a shop owner, not a lawyer. By starting a trial, entering a key or paying for a plan you agree to these; where they say &ldquo;we&rdquo;, that is Flöda, made in Sydney, Australia.</p><p className="soft">Last updated 15 October 2026.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap prose">
          <Reveal><h2 id="service">The service</h2><p>Flöda reads supplier paperwork, builds product listings from it, checks them, and writes a file your shop system imports. It runs as an app on your computer, or as a hosted copy we run for your shop alone. <strong>Flöda proposes; you check.</strong> Every listing it builds is shown to you on a review grid before anything is exported, and nothing goes to your shop that you did not export yourself. What goes to your shop, and what it sells for, is your decision and your responsibility.</p></Reveal>
          <Reveal delay={1}><h2 id="plans">Plans and the trial</h2><p>Every plan starts with {TRIAL_DAYS} days free, with no card. After that a plan is {PLANS.map((p) => `${p.name} at $${p.price}`).join(", ").replace(/, ([^,]*)$/, " or $1")} a month, in Australian dollars, including GST where it applies. Each plan is sized by how much paperwork a month holds (the plans page says how much); going past that does not stop anything, and we will suggest the plan that fits. Reading documents by AI is included on every plan up to a monthly allowance; past it, reading pauses until the next month or until you add a key of your own under Settings.</p></Reveal>
          <Reveal delay={2}><h2 id="billing">Paying and cancelling</h2><ul><li>Plans are paid monthly in advance, by card, through Stripe. We never see your card number.</li><li>You can cancel at any time from the billing page inside Flöda. Your copy keeps working to the end of the month you have paid for, and nothing is charged after that. There are no refunds for part of a month, and no fees for leaving.</li><li>If a payment fails, Stripe tries again and your copy is paused until it goes through. Nothing of yours is lost while it is paused.</li><li>We can change prices with thirty days&rsquo; notice by email; the price you were on holds until then. A plan held at a founding price stays at that price for as long as it is kept.</li></ul></Reveal>
          <Reveal delay={3}><h2 id="yours">Your data</h2><p>Your data is yours. Where it lives and what leaves your machine is set out on the <Link href="/privacy">privacy page</Link>, which is part of these terms. A desktop copy keeps everything on your computer; a hosted copy keeps it in a database and file store run for your shop alone, and we delete it thirty days after a plan ends, sooner on request. You are responsible for the paperwork you put into Flöda being yours to use and for your shop&rsquo;s own backups of what it exports.</p></Reveal>
          <Reveal delay={4}><h2 id="use">Using Flöda</h2><p>A licence is for one shop and the people who work in it. A key may not be shared with another business, resold, or used to run a copy for someone else. You may not try to take Flöda apart, take its reading service for other work, or use it to break the law or a supplier&rsquo;s terms. We can pause a key that is being used this way; we will say why.</p></Reveal>
          <Reveal delay={5}><h2 id="promises">What we promise, and what we do not</h2><p>We keep Flöda working, fix what breaks, keep an eye on a copy that reports trouble, and answer within one working day at <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. Reading by AI is good and is not perfect: a wrong price, size or barcode can get through, which is why the review grid exists and why some things stop an export until a person looks. Flöda is provided as it is, and to the extent the law allows we are not liable for loss that comes from a listing you exported, from a supplier&rsquo;s paperwork being wrong, or from a service we rely on (Anthropic, Stripe, GitHub, your shop platform) being unavailable. Where liability cannot be excluded it is limited to what you paid us in the three months before the claim. Nothing here takes away rights the Australian Consumer Law gives you.</p></Reveal>
          <Reveal delay={6}><h2 id="ending">Ending</h2><p>You can stop at any time by cancelling. We can end a plan with thirty days&rsquo; notice, or at once if a key is misused; in either case you keep your data and your copy keeps working to the end of the period paid for. If we ever stop offering Flöda altogether we will give at least ninety days&rsquo; notice and your desktop copy keeps working on your machine without us.</p></Reveal>
          <Reveal delay={7}><h2 id="law">The rest</h2><p>These terms are governed by the law of New South Wales, Australia. If we change them we will put the date at the top and email paying customers about anything that matters. Questions to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.</p></Reveal>
        </div>
      </section>
    </Site>
  );
}
