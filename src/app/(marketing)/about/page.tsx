import type { Metadata } from "next";
import Link from "next/link";
import { Site } from "../Shell";
import { Reveal } from "../welcome/Motion";
import "../welcome/welcome.css";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";

export const metadata: Metadata = { title: "About Flöda", description: "Flöda was built inside a working ski and snowboard shop over a full buying season, by people who set it up with you." };

export default function AboutPage() {
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">About</span><h1>Built inside a shop, not pitched at one.</h1><p className="lede">Flöda began as the tool a specialty retailer needed in its own back office, in the weeks when a season&rsquo;s paperwork lands all at once. It still works that way: every rule in it was settled against real files, and every shop that joins is set up by a person who has done it before.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap prose">
          <Reveal><h2>Where it came from</h2><p>A ski and snowboard shop in Australia sells skis, boards, boots, bindings, outerwear, packs and climbing gear from twenty-odd suppliers, and each of them sends their orders differently: a spreadsheet from one, a PDF from the next, a photographed order form with the rep&rsquo;s handwriting on it from a third. Someone sat with that pile for days every season, typing it into Shopify.</p><p>Flöda was written to read that pile. The shop&rsquo;s whole buying season went through it line by line, and every convention the catalogue had, how a binding is named, what gets tagged with a season, which menu a glove sits under, was measured before it was written down. That is why it starts blank for a new shop and learns from that shop&rsquo;s own export, rather than guessing from ours.</p></Reveal>
          <Reveal delay={1}><h2>How we work with you</h2><p>We do not send you a help centre. A forward-deployed engineer gets on a call, loads your Shopify catalogue so Flöda learns how you file and name things, and reads your first invoices with you, supplier by supplier, until each one reads the way you would have done it by hand. What you settle together is remembered for every invoice after. When something new comes up mid-season, the same person is the one you write to.</p></Reveal>
          <Reveal delay={2}><h2>What we believe</h2><ul><li><strong>Nothing touches your store on our say-so.</strong> Flöda writes files; you check them and import them.</li><li><strong>Your data is yours and stays with you.</strong> A desktop copy keeps everything on your machine. <Link href="/privacy">Here is exactly where it goes.</Link></li><li><strong>A new layout deserves a closer look.</strong> The first invoice from a supplier is where things go wrong, so Flöda says so and asks you to check.</li><li><strong>Price by the work saved, honestly.</strong> A 50-product order is twelve hours by hand and two through Flöda. The plans are sized by the month&rsquo;s paperwork and <Link href="/welcome#pricing">say so in numbers</Link>.</li></ul></Reveal>
          <Reveal delay={3}><h2>Say hello</h2><p>Flöda is made in Sydney. Write to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> and a person answers, usually the same day.</p></Reveal>
        </div>
      </section>
    </Site>
  );
}
