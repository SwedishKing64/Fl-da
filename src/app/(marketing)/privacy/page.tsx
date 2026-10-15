import type { Metadata } from "next";
import { Site } from "../Shell";
import { Reveal } from "../welcome/Motion";
import "../welcome/welcome.css";

export const metadata: Metadata = { title: "Flöda privacy", description: "Where a shop's data lives, what leaves the machine, and what Flöda keeps." };

export default function PrivacyPage() {
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Privacy</span><h1>Where your data lives, and where it goes.</h1><p className="lede">Written for a shop owner, not a lawyer. The short version: a desktop copy keeps everything on your machine, and the only things that leave it are the ones listed here.</p><p className="soft">Last updated 15 October 2026.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap prose">
          <Reveal><h2 id="data">What Flöda keeps, and where</h2><p><strong>A desktop copy</strong> keeps its database (your suppliers, imports, products, prices, settings, staff accounts) and every file you upload in Flöda&rsquo;s data folder on your computer. Nothing of this is copied to us. If you uninstall Flöda the folder stays until you delete it.</p><p><strong>A hosted copy</strong> keeps the same things in a database and a file store run for that copy alone, in Sydney, Australia. One shop per copy; no shop&rsquo;s data is ever in another shop&rsquo;s copy.</p><p>Passwords are stored hashed. Sessions expire. Admin and staff roles are separate.</p></Reveal>
          <Reveal delay={1}><h2>What leaves your machine</h2><ul><li><strong>A licence check</strong>, about once a day: your licence key, the shop&rsquo;s name, the app&rsquo;s version, which platform it runs on, and how many invoices and products the month has held so far. This is how we know a copy is yours and that its plan fits.</li><li><strong>Reading by AI.</strong> When a PDF, a photograph or a brand page is read, the document is sent to Anthropic&rsquo;s API to be read. On a plan with reading included it passes through floda.ai on the way; we count what it used and keep nothing of the document. A shop using its own Anthropic key sends it to Anthropic directly.</li><li><strong>Brand pages.</strong> When you give Flöda a link to a product page, it fetches that page and its pictures.</li><li><strong>Feedback you send</strong> from the Feedback button, with your email if you give it.</li><li><strong>Updates.</strong> The app asks GitHub whether a newer version exists. No data of yours is sent with that question.</li></ul></Reveal>
          <Reveal delay={2}><h2 id="ai">Reading by AI</h2><p>Documents are read by Claude, through Anthropic&rsquo;s API. Under Anthropic&rsquo;s commercial terms, API traffic is not used to train their models. Only the document being read is sent, shrunk where it is a photograph; your catalogue, prices and customer data are not. Flöda keeps a count of tokens used per shop and nothing of the document itself.</p></Reveal>
          <Reveal delay={3}><h2>What we keep about you as a customer</h2><p>Your shop&rsquo;s name, your contact name and email, which plan you are on, your licence key, when your copy last checked in and which version it was, the month&rsquo;s invoice and product counts your copy reported, and what reading through Flöda cost that month. Leads from the website are kept until they become a customer or are dismissed.</p></Reveal>
          <Reveal delay={4}><h2>Ending</h2><p>When you stop, your copy keeps working to the end of the period you paid for, and your data stays on your machine; nothing of it was with us to delete. We remove your customer record and licence key on request. A hosted copy&rsquo;s database and files are deleted thirty days after the plan ends, sooner if you ask.</p></Reveal>
          <Reveal delay={5}><h2>Questions</h2><p>Write to <a href="mailto:hello@floda.ai">hello@floda.ai</a>. Flöda is made in Sydney, Australia.</p></Reveal>
        </div>
      </section>
    </Site>
  );
}
