import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";
import Image from "next/image";
import Link from "next/link";
import { Reveal, Tilt } from "./Motion";
import { Calculator } from "./Calculator";
import { Faq } from "../Story";
import { Site } from "../Shell";
import { Story } from "../Story";
import { Screens } from "../Screens";
import { describePlanSize, PLANS, per } from "@/lib/catalog/plans";
import "./welcome.css";

export const metadata: Metadata = {
  title: "Flöda",
  description: "Supplier paperwork in, shop-ready listings out. Flöda reads invoices, order forms, spec sheets and photographed paperwork into Shopify products, stock updates and price changes, and learns how your shop does it from your own catalogue.",
};

/**
 * The front door. Everything on it is true of the product as it stands today; nothing is
 * promised that is not built. The motion is in Motion.tsx; the look is in welcome.css.
 */
export default function WelcomePage() {
  return (
    <Site>
        {/* ---------------------------------------------------------------- hero */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="mesh" aria-hidden><i /><i /><i /></div>
          <div className="wrap">
            <Reveal className="eyebrow-wrap"><span className="eyebrow"><span className="pulse" />Now onboarding founding retailers</span></Reveal>
            <Reveal delay={1}><h1 id="hero-title">Supplier paperwork in.<br /><span className="grad">Shop-ready listings out.</span></h1></Reveal>
            <Reveal delay={2} as="p" className="lede">
              Flöda reads the invoices, order confirmations, spec sheets and scribbled-on order forms your suppliers send, and turns them into Shopify products, stock updates and price changes, the way your shop already does it. Every cell checked on screen before anything touches your store.
            </Reveal>
            <Reveal delay={3} className="ctas">
              <a href="#register" className="btn btn-meta btn-lg">Start free trial<span aria-hidden>→</span></a>
              <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
            </Reveal>
            <Reveal delay={4} as="p" className="note">14 days free on any plan. An app for Windows and Mac, or hosted. Set up with you by a Flöda engineer.</Reveal>

            <Reveal delay={3} className="demo-wrap">
              <Tilt>
                <div className="window hero-shot" aria-label="The review grid, with a supplier's order read into it">
                  <div className="chrome"><i /><i /><i /><span className="url">Flöda · Northwind order 1182 · Review</span><span className="live"><b /> 7 products · 12 variants</span></div>
                  <div className="shot"><Image src="/shots/review-grid.jpg" alt="The review grid: every product and variant from a supplier's order with SKU, barcode, options, stock, cost and price, and the order's totals" width={1800} height={1433} sizes="(min-width: 1100px) 1040px, 100vw" priority /></div>
                </div>
              </Tilt>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------------- facts */}
        <section className="facts" aria-label="In short">
          <div className="wrap">
            <Reveal className="fact" delay={0}><b>Spreadsheets, PDFs, photos</b><span>Whatever the supplier sends, pen marks included.</span></Reveal>
            <Reveal className="fact" delay={1}><b>Learns your catalogue</b><span>Your own Shopify export teaches it how you file, tag and name things.</span></Reveal>
            <Reveal className="fact" delay={2}><b>You press import</b><span>Flöda writes the file. Nothing touches your store on its own.</span></Reveal>
            <Reveal className="fact" delay={3}><b>Set up with you</b><span>A Flöda engineer on a call, on your own invoices, supplier by supplier.</span></Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------- how */}
        <section id="how" className="band">
          <div className="wrap">
            <Reveal className="head center">
              <span className="eyebrow">How it works</span>
              <h2>Three steps. The third one is you checking.</h2>
              <p className="lede">Nothing goes to your store on Flöda&rsquo;s say-so. It does the reading and the matching; you look at the result and press import.</p>
            </Reveal>
            <Story
              steps={[
                { title: "Drop in what the supplier sent", text: "A spreadsheet, a PDF, or a photo off your phone, pen marks and all. Flöda reads the print and the handwriting: a price in the margin is the RRP, a percentage is the discount, a year is the season." },
                { title: "It becomes your catalogue\u2019s shape", text: "Lines are matched to what you already sell by barcode, code or name. New products are named, categorised, tagged and priced the way your shop does it, learned from your own Shopify export." },
                { title: "Check it, then import it", text: "Every product in a grid, every changed cell listed. Download a Shopify CSV, or only the product types you\u2019re working on today, and import it yourself." },
              ]}
              panels={[
                <div key="in" className="sp sp-in"><div className="sheet"><span className="pen">×3</span><i /><i /><i /><i /><span className="pen two">YT 27</span></div><div className="cap">What the rep sent, photographed</div></div>,
                <div key="shape" className="sp sp-shape"><div className="rowz"><div className="r h"><span>Product</span><span>Type</span><span>Tags</span><span>Price</span></div><div className="r"><span>Merino Crew Sweater</span><span>Knitwear</span><span>merino · winter</span><span>$139</span></div><div className="r"><span>Trail Runner 2</span><span>Footwear</span><span>trail-running</span><span>$179</span></div><div className="r"><span>Daypack 22L</span><span>Bags</span><span>daypacks · travel</span><span>$129</span></div></div><div className="cap">Named, filed, tagged and priced your way</div></div>,
                <div key="check" className="sp sp-check"><div className="grid"><div className="cell ok">✓ 7 products</div><div className="cell ok">✓ 12 variants</div><div className="cell warn">! 1 to check</div><div className="cell dl">↓ Shopify CSV</div></div><div className="cap">You check, you press import</div></div>,
              ]}
            />
          </div>
        </section>

        {/* ------------------------------------------------------------ product */}
        <section id="product" className="band grey">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow">What it does</span>
              <h2>The jobs a delivery is made of, done in an afternoon.</h2>
            </Reveal>
            <div className="bento">
              <Reveal className="tile big" delay={0}>
                <div className="tile-shot"><Image src="/shots/review-grid.jpg" alt="The review grid" width={1800} height={1433} sizes="(min-width: 860px) 560px, 100vw" /></div>
                <h3>New products</h3>
                <p>Invoices and order confirmations into ready-to-import listings: read, joined to the spec sheet and barcode list, named, categorised, tagged, priced, with descriptions, specs and colour-matched pictures from the brand&rsquo;s own page.</p>
              </Reveal>
              <Reveal className="tile" delay={1}>
                <div className="tile-shot"><Image src="/shots/bulk.jpg" alt="Prices and stock" width={1800} height={1138} sizes="(min-width: 860px) 360px, 100vw" /></div>
                <h3>Prices and stock</h3>
                <p>Changes to what you already sell, said in plain words. A sale, a clearance, a delivery to add to stock. Every cell that moves, shown first.</p>
              </Reveal>
              <Reveal className="tile" delay={2}>
                <div className="tile-shot"><Image src="/shots/tidy.jpg" alt="Tidy a document" width={1800} height={1138} sizes="(min-width: 860px) 360px, 100vw" /></div>
                <h3>Tidy a document</h3>
                <p>A photo of scribbled-on paperwork becomes a table you can check, doubtful readings marked, saved as a CSV the other jobs take.</p>
              </Reveal>
              <Reveal className="tile" delay={3}>
                <div className="tile-shot"><Image src="/shots/learn.jpg" alt="Teach Flöda your catalogue" width={1800} height={1138} sizes="(min-width: 860px) 360px, 100vw" /></div>
                <h3>Learns your shop</h3>
                <p>Starts blank. Your Shopify export teaches it your product types, your menus, how you spell every tag and what each brand&rsquo;s listings look like.</p>
              </Reveal>
              <Reveal className="tile" delay={4}>
                <div className="tile-ui app-ui"><div className="dock"><span className="win">▣</span><span className="mac">⌘</span></div><span className="lbl">Floda-Setup.exe · Floda.dmg</span></div>
                <h3>Runs on your PC</h3>
                <p>An app for Windows and Mac, with its database on your machine. Or hosted, if you&rsquo;d rather. Your supplier costs never sit on someone else&rsquo;s server unless you choose it.</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- screens */}
        <section id="screens" className="band">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow">The product</span>
              <h2>What it looks like, with a real order in it.</h2>
              <p className="lede">These are screens from a copy of Flöda with a supplier&rsquo;s order read into it, not drawings. Pick one.</p>
            </Reveal>
            <Reveal delay={1}><Screens /></Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- proof */}
        <section className="band night">
          <div className="glow" aria-hidden />
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow dark">Built in a real shop</span>
              <h2>Every rule was settled against real paperwork, not guessed.</h2>
              <p className="lede">Flöda was built inside a working specialty retailer, and that shop&rsquo;s whole buying season went through it line by line: twenty-odd suppliers, every layout they send, every convention the catalogue had. What that taught it is what makes the first invoice from any supplier read well, whatever the shop sells.</p>
            </Reveal>
            <Reveal delay={1} className="quote-card">
              <p className="quote">&ldquo;A name is the loosest key, so it&rsquo;s the strictest match. Whole words only, never a substring, and a name that fits two products is refused with both named rather than guessed.&rdquo;</p>
              <p className="cite">From the engineering notes. The product is built this carefully all the way down.</p>
            </Reveal>
            <div className="proof">
              <Reveal delay={1}><b>Sizes and colours become variants</b><span>Not part of the name. Every variant gets its value, its barcode and its stock, the way Shopify wants it.</span></Reveal>
              <Reveal delay={2}><b>Name matches confirmed</b><span>An invoice without barcodes is matched by name and you say whether it&rsquo;s the same product or this year&rsquo;s model.</span></Reveal>
              <Reveal delay={3}><b>Pictures in the colour ordered</b><span>Pulled from the brand&rsquo;s page, matched to the colourway on the order, resized and centred.</span></Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- who */}
        <section id="who" className="band">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow">Who it&rsquo;s for</span>
              <h2>Retailers whose suppliers send paperwork, not feeds.</h2>
              <p className="lede">Specialty retail runs on order forms and PDFs. If a delivery starts with a pile of them, Flöda is for you. It starts blank and learns your catalogue, so it does not care what you sell.</p>
            </Reveal>
            <div className="fit four">
              <Reveal className="card" delay={0}><span className="label">Sizes, colours, seasons</span><h3>Outdoor and sports</h3><p>Apparel, footwear, packs, hardware. Model years that change every season and sizes that run in two scales.</p></Reveal>
              <Reveal className="card" delay={1}><span className="label">Colourways and size runs</span><h3>Fashion and footwear</h3><p>A style in six colours and eight sizes is one product with forty-eight variants, not forty-eight lines typed by hand.</p></Reveal>
              <Reveal className="card" delay={2}><span className="label">Long catalogues</span><h3>Home and lifestyle</h3><p>Kitchen, gifts, toys, stationery: many suppliers, small orders, and a tag taxonomy nobody wants to retype.</p></Reveal>
              <Reveal className="card" delay={3}><span className="label">Starts blank, learns yours</span><h3>Bikes, fishing, anything specialist</h3><p>Tell us which supplier gives you the most grief and that is where set-up starts.</p></Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- data */}
        <section id="data" className="band grey">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow">Your data</span>
              <h2>Your costs stay on your machine.</h2>
              <p className="lede">A desktop copy keeps its database and every file you upload on your own computer. The only things that leave it are the ones we list, and we list them all.</p>
            </Reveal>
            <div className="data">
              <Reveal className="dcard" delay={0}><span className="ico" aria-hidden>🖥</span><h3>On your machine</h3><p>Your suppliers, prices, imports and staff accounts live in Flöda&rsquo;s data folder on your PC or Mac. Uninstall it and the folder is still yours.</p></Reveal>
              <Reveal className="dcard" delay={1}><span className="ico" aria-hidden>🛡</span><h3>Nothing to your store on its own</h3><p>Flöda writes a Shopify file. You look at the grid, download the file and import it. There is no connection that can change a listing without you.</p></Reveal>
              <Reveal className="dcard" delay={2}><span className="ico" aria-hidden>🤖</span><h3>Reading by AI, included</h3><p>Documents are read by Claude through Anthropic&rsquo;s API, which does not train on them. Only the document goes, never your catalogue. <Link href="/privacy">Exactly what leaves your machine.</Link></p></Reveal>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- questions */}
        <section id="questions" className="band">
          <div className="wrap qa">
            <Reveal className="head">
              <span className="eyebrow">Questions</span>
              <h2>The ones retailers ask first.</h2>
              <p className="lede">The rest are on the <Link href="/faq">questions page</Link>, and a person answers the ones that are not.</p>
            </Reveal>
            <Reveal delay={1}>
              <Faq items={[
                { q: "Do I need an Anthropic account or an API key?", a: <p>No. Reading by AI is included in every plan. A shop that would rather have the reading billed to its own Anthropic account can paste a key of its own in Settings.</p> },
                { q: "What happens on the first invoice from a new supplier?", a: <p>Flöda says it is a new layout and asks you to check the five things a new layout gets wrong. What you fix is remembered for that supplier. In setup you can do this for every supplier at once, from one example each.</p> },
                { q: "Does it work for shops that are not outdoor or sports?", a: <p>Yes. Flöda starts blank and learns your product types, your menus, your tags and your naming from your own Shopify export. It does not care what you sell.</p> },
                { q: "How does the free trial work?", a: <p>Every plan starts with 14 days free and no card. You pick a plan when you set up, use everything, and a person from Flöda gets in touch before the trial ends. Nothing is charged until you have said which plan you want.</p> },
              ]} />
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- pricing */}
        <section id="pricing" className="band grey">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow">Pricing</span>
              <h2>Priced by the fortnight&rsquo;s paperwork, billed every two weeks. Work out what it saves you.</h2>
              <p className="lede">Listing 100 products by hand is a day of someone&rsquo;s time. Flöda reads, matches and prices them in about 15 minutes, faster per product the bigger the order, and you check the grid. Put your own numbers in.</p>
            </Reveal>
            <Reveal delay={1}><Calculator /></Reveal>
            <div className="plans" aria-label="Plans">
              {PLANS.map((p, i) => (
                <Reveal key={p.id} className={`tier${p.founding ? " featured" : ""}`} delay={i}>
                  {p.founding && <span className="tier-tag">Founding price, held for you</span>}
                  <h3>{p.name}</h3>
                  <p className="tier-blurb">{p.blurb}</p>
                  <div className="tier-price"><span className="cur" aria-hidden>$</span><span className="amt">{p.price}</span><span className="per">{per(p)}</span></div>
                  <ul className="ticks">
                    <li>{describePlanSize(p)}</li>
                    <li>{p.people}</li>
                    <li>{p.reading === "included" ? "AI reading included, nothing else to buy" : "Reading on your own Anthropic key, at Anthropic's rates"}</li>
                    <li>Set up for you by a Flöda engineer</li>
                    {p.id === "unlimited" && <li>An engineer on call through your season</li>}
                  </ul>
                  <Link href={`/account/signup?plan=${p.id}`} className={`btn ${p.founding ? "btn-meta" : "btn-grey"}`}>Start free trial</Link>
                </Reveal>
              ))}
            </div>
            <div className="signup">
              <Reveal className="fde" delay={1}>
                <span className="eyebrow">Set up for you</span>
                <h3>A Flöda engineer sets it up with you. Not a help centre.</h3>
                <p>Every plan starts the same way: a forward-deployed engineer gets on a call with you, loads your Shopify catalogue so Flöda learns how you file and name things, and reads your first invoices with you, supplier by supplier, fixing anything in the wrong column until it reads the way you would. What you settle together is remembered for every invoice after.</p>
                <ul className="ticks">
                  <li>14 days free, no card to start</li>
                  <li>Windows and Mac app, or hosted</li>
                  <li>Your data stays on your machine</li>
                  <li>Change plan any month; nothing stops when a busy month runs past it</li>
                </ul>
              </Reveal>
              <Reveal delay={2} className="form-card">
                <div id="register">
                  <h3>Start your 14-day trial</h3>
                  <RegisterForm />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- cta */}
        <section className="cta">
          <div className="wrap">
            <Reveal>
              <h2>Your next season&rsquo;s paperwork, read for you.</h2>
              <p className="lede">Two weeks free on any plan, then $20 a month with your own key or from $49 a fortnight with reading included. A Flöda engineer sets it up with you on one of your own supplier invoices.</p>
              <a href="#register" className="btn btn-meta btn-lg">Start free trial<span aria-hidden>→</span></a>
            </Reveal>
          </div>
        </section>
    </Site>
  );
}
