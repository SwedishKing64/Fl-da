import type { Metadata } from "next";
import Link from "next/link";
import { Site } from "../Shell";
import { Faq } from "../Story";
import { Reveal } from "../welcome/Motion";
import { TRIAL_DAYS, describeReading, planOf } from "@/lib/catalog/plans";
import "../welcome/welcome.css";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";

export const metadata: Metadata = { title: "Questions about Flöda", description: "Data, security, suppliers, Shopify, plans and the trial: the questions retailers ask before they start." };

const shop = planOf("shop");
  const starter = planOf("starter");

export default function FaqPage() {
  const items = [
    { q: "Where does my data live?", a: <p>On a desktop copy, on your own machine: a database and your uploaded files in Flöda&rsquo;s data folder, which you can open from the File menu. On a hosted copy, in a database and file store of its own in Sydney, one shop per copy, never mixed with another. <Link href="/privacy">The privacy page says exactly what leaves your machine.</Link></p> },
    { q: "Does anything go to my Shopify store without me?", a: <p>No. Flöda writes a Shopify CSV; you look at the grid, download the file and import it yourself. Prices and stock changes work the same way: every changed cell is listed before anything is downloaded.</p> },
    { q: "What does it read?", a: <p>Spreadsheets and CSVs, PDFs, and photographs of paperwork, handwriting and pen marks included. A price in the margin is read as the RRP, a percentage as a discount, a year as the season. Brand pages supply descriptions, specs and pictures matched to the colours you ordered.</p> },
    { q: "Do I need an Anthropic account or an API key?", a: <p>No. Reading by AI is included in every plan. A shop that would rather have the reading billed to its own Anthropic account can paste a key of its own in Settings, and Flöda uses that instead.</p> },
    { q: "What happens on the first invoice from a new supplier?", a: <p>Flöda says it is a new layout and asks you to check the five things a new layout gets wrong: cost and currency, quantities, sizes and colours, SKUs and barcodes, the product type. What you fix is remembered for that supplier, and the next invoice from them reads the way you left this one. In setup you can do this for every supplier at once, from one example each.</p> },
    { q: "How does the free trial work?", a: <p>Every plan starts with {TRIAL_DAYS} days free and no card. You pick a plan when you set up, use everything, and a person from Flöda gets in touch before the trial ends. Nothing is charged until you have said which plan you want.</p> },
    { q: "What if a busy fortnight runs past my plan?", a: <p>Nothing stops. The Shop plan is sized by a typical fortnight (up to {shop.invoices} invoices and about {shop.products} products); a fortnight that runs past is shown to you and to us, and we talk about moving up. {starter.name} has no invoice count at all: {describeReading(starter)}. The reading allowance is the only hard limit on any plan, and we raise it on request.</p> },
    { q: "Does it work for shops that are not snow or outdoor?", a: <p>Yes. Flöda starts blank and learns your product types, your menus, your tags and your naming from your own Shopify export. Snow and outdoor is where it was built, so binding mount charges and ski packages are built in; a bike, fishing or camping shop teaches it theirs in setup.</p> },
    { q: "Windows or Mac?", a: <p>Both, as an app you install, with everything on your machine. A hosted copy is available if you would rather not install anything. <Link href="/download">The downloads are here.</Link> The app keeps itself current on Windows; on a Mac it tells you when a newer version is out.</p> },
    { q: "Can my staff use it?", a: <p>On the Shop and Unlimited plans, everyone. Each person signs in as themselves, and the marker tag on a listing says who built it. The Starter plan is one person.</p> },
    { q: "How do I get help?", a: <p>The Feedback button inside the app reaches us directly, or write to {SUPPORT_EMAIL}. The same engineer who set you up answers. There is no ticket queue.</p> },
    { q: "What is the Own key plan?", a: <p>The software alone, ${planOf("ownkey").price} a month, with reading billed by Anthropic to a key of your own. Make an account at console.anthropic.com, add a card and a monthly spending limit, make a key, and paste it once under Settings → Reading documents in Flöda. Reading a typical invoice costs cents. Everything else is the same as the other plans; the difference is who Anthropic bills.</p> },
    { q: "How do I cancel?", a: <p>From the billing page inside Flöda, or write to us; the plan ends at the end of the fortnight you have paid for. Your data stays on your machine either way, and you can keep every file Flöda made.</p> },
  ];
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Questions</span><h1>What retailers ask before they start.</h1><p className="lede">If yours is not here, write to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> and a person answers.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap narrow"><Reveal><Faq items={items} /></Reveal></div>
      </section>
    </Site>
  );
}
