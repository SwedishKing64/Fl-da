import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";
import "./welcome.css";

export const metadata: Metadata = {
  title: "Flöda",
  description: "Supplier paperwork in, shop-ready listings out. Flöda reads invoices, order forms, spec sheets and photographed paperwork into Shopify products, stock updates and price changes.",
};

/**
 * The front door, for a retailer who has not signed in.
 *
 * Everything on it is true of the product as it stands today: the four jobs, the way documents
 * are read, the numbers from the shop it was built in. Nothing is promised that is not built.
 */
export default function WelcomePage() {
  return (
    <div className="floda">
      <header className="bar">
        <div className="wrap">
          <Link href="/welcome" className="mark">Flöda</Link>
          <nav aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#jobs">What it does</a>
            <a href="#who">Who it&rsquo;s for</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/login" className="btn btn-grey">Sign in</Link>
            <a href="#register" className="btn btn-meta">Get access</a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <span className="eyebrow">For retailers on Shopify</span>
            <h1>Supplier paperwork in. <span className="grad">Shop-ready listings out.</span></h1>
            <p className="lede">
              Flöda reads the invoices, order confirmations, spec sheets and scribbled-on order forms your suppliers send, and turns them into Shopify products, stock updates and price changes. Every cell checked on screen before anything touches your store.
            </p>
            <div className="ctas">
              <a href="#register" className="btn btn-meta">Register interest</a>
              <a href="#how" className="btn btn-grey">See how it works</a>
            </div>
            <p className="note">Built inside a working ski and snowboard shop over a full buying season. Opening to other retailers now.</p>

            <div className="window" aria-label="A supplier order form becoming shop listings">
              <div className="chrome"><i /><i /><i /><span className="url">floda.ai/batches/burton-w27</span></div>
              <div className="pane">
                <div>
                  <div className="title">What the rep sent, photographed</div>
                  <div className="form-line"><span>10688 CUSTOM CAMBER 154</span><span>3</span><span className="pen">999</span></div>
                  <div className="form-line"><span>10688 CUSTOM CAMBER 158</span><span>2</span><span className="pen">YT 27</span></div>
                  <div className="form-line"><span>13170 FREESTYLE REFLEX M</span><span>4</span><span className="pen">-20%</span></div>
                  <div className="form-line"><span>10406 GORE GLOVE L</span><span>6</span><span className="pen">w/ liner</span></div>
                </div>
                <div className="mid" aria-hidden>→</div>
                <div>
                  <div className="title">What goes into Shopify</div>
                  <div className="listing">
                    <div><b>Men&rsquo;s Custom Camber Snowboard 2027</b><span className="soft">154, 158 · colour-matched pictures · tech specs from the page</span><div className="tags"><span className="tag">snowboards</span><span className="tag">freestyle and all-mountain boards</span><span className="tag grey">2027</span></div></div>
                    <div className="price">$999.00</div>
                  </div>
                  <div className="listing">
                    <div><b>Men&rsquo;s Freestyle Re:Flex Snowboard Bindings 2027</b><span className="soft">stock added to the listing you already have</span><div className="tags"><span className="tag">snowboard-bindings</span><span className="tag grey">20% off</span></div></div>
                    <div className="price">+4</div>
                  </div>
                  <div className="listing">
                    <div><b>Gore Glove 2027</b><span className="soft">a size you didn&rsquo;t stock before, added as a variant</span><div className="tags"><span className="tag">ski-gloves</span><span className="tag">outdoor</span></div></div>
                    <div className="price">+6</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="band">
          <div className="wrap">
            <div className="head center">
              <span className="eyebrow">How it works</span>
              <h2>Three steps. The third one is you checking.</h2>
              <p className="lede">Nothing goes to your store on Flöda&rsquo;s say-so. It does the reading and the matching; you look at the result and press import.</p>
            </div>
            <div className="grid three">
              <div><span className="n">01</span><span className="emo" aria-hidden>📷</span><h3>Drop in what the supplier sent</h3><p className="soft">A spreadsheet, a PDF, or a photo off your phone, pen marks and all. Flöda reads the print and the handwriting: a price in the margin is the RRP, a percentage is the discount, a year is the season.</p></div>
              <div><span className="n">02</span><span className="emo" aria-hidden>🧩</span><h3>It becomes your catalogue&rsquo;s shape</h3><p className="soft">Lines are matched to what you already sell by barcode, code or name. New products are named, categorised, tagged and priced the way your shop does it, learned from your own Shopify exports.</p></div>
              <div><span className="n">03</span><span className="emo" aria-hidden>✅</span><h3>Check it, then import it</h3><p className="soft">Every product in a grid, every changed cell listed. Download a Shopify CSV, or only the kinds of product you&rsquo;re working on today, and import it yourself.</p></div>
            </div>
          </div>
        </section>

        <section id="jobs" className="band grey">
          <div className="wrap">
            <div className="head">
              <span className="eyebrow">What it does</span>
              <h2>Three jobs a buying season is made of.</h2>
            </div>
            <div className="grid three">
              <div><span className="emo" aria-hidden>📦</span><h3>New products</h3><p className="soft">Invoices and order confirmations into ready-to-import listings.</p><ul><li>Reads CSV, Excel, PDF and photos</li><li>Joins the order form to the spec sheet and barcode list</li><li>Pulls descriptions, specs and colour-matched pictures from the brand&rsquo;s page</li><li>Pick which kinds of product to build today</li></ul></div>
              <div><span className="emo" aria-hidden>🏷️</span><h3>Prices and stock</h3><p className="soft">Changes to what you already sell, said in plain words.</p><ul><li>&ldquo;All 2026 jackets 30% off and into clearance&rdquo;</li><li>A delivery added to stock, matched line by line</li><li>Mount charges, cost changes, title years</li><li>Every cell that moves, shown first</li></ul></div>
              <div><span className="emo" aria-hidden>📸</span><h3>Tidy a document</h3><p className="soft">A photo of scribbled-on paperwork into a table you can check.</p><ul><li>Print and pen read together</li><li>Doubtful readings marked, with the other reading</li><li>Saved as a CSV the other jobs take</li></ul></div>
            </div>
          </div>
        </section>

        <section className="band night">
          <div className="wrap">
            <div className="head">
              <span className="eyebrow">Built in a real shop</span>
              <h2>Every rule was settled against real files, not guessed.</h2>
            </div>
            <div className="proof">
              <div><div className="num">967</div><p className="soft">products across ten Shopify exports, measured before any tagging rule was written.</p></div>
              <div><div className="num">1 season</div><p className="soft">of real supplier paperwork: order forms, spec exports, barcode lists, invoices, photographed and scribbled on.</p></div>
              <div><div className="num">0</div><p className="soft">changes to your store without you seeing them first. Flöda writes files; you import them.</p></div>
            </div>
            <p className="quote">&ldquo;A name is the loosest key, so it&rsquo;s the strictest match. Whole words only, never a substring, and a name that fits two products is refused with both named rather than guessed.&rdquo;</p>
            <p className="soft" style={{ marginTop: 10, fontSize: 14 }}>From the engineering notes. The product is built this carefully all the way down.</p>
          </div>
        </section>

        <section id="who" className="band">
          <div className="wrap">
            <div className="head">
              <span className="eyebrow">Who it&rsquo;s for</span>
              <h2>Retailers whose suppliers send paperwork, not feeds.</h2>
              <p className="lede">Specialty retail runs on order forms and PDFs. If your season starts with a pile of them, Flöda is for you.</p>
            </div>
            <div className="fit">
              <div className="card now"><span className="label">Ready now</span><h3>Snow and outdoor</h3><p className="soft">Skis, boards, boots, bindings and packages, outerwear, packs and climbing gear. Binding mount charges, ski packages and season tagging built in.</p></div>
              <div className="card"><span className="label">Next</span><h3>Bikes</h3><p className="soft">The same supplier paperwork problem, with sizes, colours and model years that change every season.</p></div>
              <div className="card"><span className="label">Next</span><h3>Fishing, camping, anything specialist</h3><p className="soft">Tell us which supplier gives you the most grief and we&rsquo;ll start there.</p></div>
            </div>
          </div>
        </section>

        <section id="pricing" className="band grey">
          <div className="wrap signup">
            <div>
              <span className="eyebrow">Pricing</span>
              <h2 style={{ marginTop: 14 }}>Founding-retailer pricing.</h2>
              <p className="lede" style={{ marginTop: 16 }}>One flat monthly fee for the shop, however many staff and however many invoices, set with the first retailers to come on board and held for them. No per-seat charges, no setup fee, and you keep every file Flöda makes.</p>
              <p className="soft" style={{ marginTop: 16 }}>Register and we&rsquo;ll walk you through it on one of your own supplier invoices, so you can see what it makes of your paperwork before you decide anything.</p>
            </div>
            <div id="register">
              <RegisterForm />
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span className="mark">Flöda</span>
          <span>Supplier paperwork in, shop-ready listings out · hello@floda.ai · Sydney</span>
        </div>
      </footer>
    </div>
  );
}
