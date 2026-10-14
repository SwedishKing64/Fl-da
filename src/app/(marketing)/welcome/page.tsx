import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";
import "./welcome.css";

export const metadata: Metadata = {
  title: "Floda",
  description: "Supplier paperwork in, shop-ready listings out. Floda reads invoices, order forms, spec sheets and photographed paperwork into Shopify products, stock updates, price changes and QuickBooks bills.",
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
          <Link href="/welcome" className="mark" aria-label="Floda"><span className="dot" aria-hidden />Floda</Link>
          <nav aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#jobs">What it does</a>
            <a href="#who">Who it&rsquo;s for</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
        </div>
      </header>

      <main>
        <section className="wrap hero">
          <div>
            <p className="eyebrow">For retailers on Shopify</p>
            <h1 style={{ marginTop: 14 }}>Supplier paperwork in. Shop-ready listings out.</h1>
            <p className="lede" style={{ marginTop: 20 }}>
              Floda reads the invoices, order confirmations, spec sheets and photographed, scribbled-on order forms your suppliers send, and turns them into Shopify products, stock updates, price changes and QuickBooks bills. Checked on screen, every cell, before anything touches your store.
            </p>
            <div className="ctas">
              <a href="#register" className="btn btn-pine">Register interest</a>
              <a href="#how" className="btn btn-ghost">See how it works</a>
            </div>
            <p className="note">Built inside a working ski and snowboard shop over a full buying season. Opening to other retailers now.</p>
          </div>

          <div className="demo" aria-label="A supplier order form becoming shop listings">
            <div className="sheet">
              <div className="title">What the rep sent, photographed</div>
              <div className="form-line"><span>10688 CUSTOM CAMBER 154</span><span>3</span><span className="pen">999</span></div>
              <div className="form-line"><span>10688 CUSTOM CAMBER 158</span><span>2</span><span className="pen">YT 27</span></div>
              <div className="form-line"><span>13170 FREESTYLE REFLEX M</span><span>4</span><span className="pen">-20%</span></div>
              <div className="form-line"><span>10406 GORE GLOVE L</span><span>6</span><span className="pen">w/ liner</span></div>
            </div>
            <div className="arrow">read, matched, priced, tagged</div>
            <div className="sheet">
              <div className="title">What goes into Shopify</div>
              <div className="listing">
                <div><b>Men&rsquo;s Custom Camber Snowboard 2027</b><span className="soft">154, 158 · colour-matched pictures · tech specs from the page</span><div className="tags"><span className="tag">snowboards</span><span className="tag">freestyle and all-mountain boards</span><span className="tag amber">2027</span></div></div>
                <div className="price">$999.00</div>
              </div>
              <div className="listing">
                <div><b>Men&rsquo;s Freestyle Re:Flex Snowboard Bindings 2027</b><span className="soft">stock added to the listing you already have</span><div className="tags"><span className="tag">snowboard-bindings</span><span className="tag amber">20% off</span></div></div>
                <div className="price">+4</div>
              </div>
              <div className="listing">
                <div><b>Gore Glove 2027</b><span className="soft">a size you didn&rsquo;t stock before, added as a variant</span><div className="tags"><span className="tag">ski-gloves</span><span className="tag">outdoor</span></div></div>
                <div className="price">+6</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="band paper">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">How it works</p>
              <h2>Three steps, and the third one is you checking.</h2>
              <p className="lede">Nothing goes to your store on Floda&rsquo;s say-so. It does the reading and the matching; you look at the result and press import.</p>
            </div>
            <div className="steps">
              <div className="step"><span className="n">1</span><h3>Drop in what the supplier sent</h3><p className="soft">A spreadsheet, a PDF, or a photo off your phone, pen marks and all. Floda reads the print and the handwriting: a price in the margin is the RRP, a percentage is the discount, a year is the season.</p></div>
              <div className="step"><span className="n">2</span><h3>It becomes your catalogue&rsquo;s shape</h3><p className="soft">Lines are matched to what you already sell by barcode, code or name. New products are named, categorised, tagged and priced the way your shop does it, learned from your own Shopify exports.</p></div>
              <div className="step"><span className="n">3</span><h3>Check it, then import it</h3><p className="soft">Every product in a grid, every changed cell listed. Download a Shopify CSV, or only the kinds of product you&rsquo;re working on today, and import it yourself.</p></div>
            </div>
          </div>
        </section>

        <section id="jobs" className="band">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">What it does</p>
              <h2>Four jobs a buying season is made of.</h2>
            </div>
            <div className="jobs">
              <div className="job"><span className="ico" aria-hidden>📦</span><h3>New products</h3><p className="soft">Invoices and order confirmations into ready-to-import listings.</p><ul><li>Reads CSV, Excel, PDF and photos</li><li>Joins the order form to the spec sheet and barcode list</li><li>Pulls descriptions, specs and colour-matched pictures from the brand&rsquo;s page</li><li>Pick which kinds of product to build today</li></ul></div>
              <div className="job"><span className="ico" aria-hidden>🏷️</span><h3>Prices and stock</h3><p className="soft">Changes to what you already sell, said in plain words.</p><ul><li>&ldquo;All 2026 jackets 30% off and into clearance&rdquo;</li><li>A delivery added to stock, matched line by line</li><li>Mount charges, cost changes, title years</li><li>Every cell that moves, shown first</li></ul></div>
              <div className="job"><span className="ico" aria-hidden>📸</span><h3>Tidy a document</h3><p className="soft">A photo of scribbled-on paperwork into a table you can check.</p><ul><li>Print and pen read together</li><li>Doubtful readings marked, with the other reading</li><li>Saved as a CSV the other jobs take</li></ul></div>
              <div className="job"><span className="ico" aria-hidden>📒</span><h3>Bills for QuickBooks</h3><p className="soft">Supplier invoices read for the books.</p><ul><li>Supplier, number, dates, goods, freight, GST, total</li><li>Checked on screen, what doesn&rsquo;t add up said</li><li>One CSV QuickBooks Online imports as bills</li></ul></div>
            </div>
          </div>
        </section>

        <section className="band pine">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">Built in a real shop</p>
              <h2>Every rule was settled against real files, not guessed.</h2>
            </div>
            <div className="proof">
              <div><div className="num">967</div><p className="soft">products across ten Shopify exports, measured before any tagging rule was written.</p></div>
              <div><div className="num">1 season</div><p className="soft">of real supplier paperwork: order forms, spec exports, barcode lists, invoices, photographed and scribbled on.</p></div>
              <div><div className="num">0</div><p className="soft">changes to your store without you seeing them first. Floda writes files; you import them.</p></div>
            </div>
            <p className="quote" style={{ marginTop: 40 }}>&ldquo;A name is the loosest key, so it&rsquo;s the strictest match. Whole words only, never a substring, and a name that fits two products is refused with both named rather than guessed.&rdquo;</p>
            <p className="soft" style={{ marginTop: 8, fontSize: 14 }}>From the engineering notes. The product is built this carefully all the way down.</p>
          </div>
        </section>

        <section id="who" className="band paper">
          <div className="wrap">
            <div className="head">
              <p className="eyebrow">Who it&rsquo;s for</p>
              <h2>Retailers whose suppliers send paperwork, not feeds.</h2>
              <p className="lede">Specialty retail runs on order forms and PDFs. If your season starts with a pile of them, Floda is for you.</p>
            </div>
            <div className="fit">
              <div className="card now"><div className="label">Ready now</div><h3>Snow and outdoor</h3><p className="soft">Skis, boards, boots, bindings and packages, outerwear, packs and climbing gear. Binding mount charges, ski packages and season tagging built in.</p></div>
              <div className="card"><div className="label">Next</div><h3>Bikes</h3><p className="soft">The same supplier paperwork problem, with sizes, colours and model years that change every season.</p></div>
              <div className="card"><div className="label">Next</div><h3>Fishing, camping, anything specialist</h3><p className="soft">Tell us which supplier gives you the most grief and we&rsquo;ll start there.</p></div>
            </div>
          </div>
        </section>

        <section id="pricing" className="band">
          <div className="wrap signup">
            <div>
              <p className="eyebrow">Pricing</p>
              <h2 style={{ marginTop: 12 }}>Founding-retailer pricing.</h2>
              <p className="lede" style={{ marginTop: 16 }}>One flat monthly fee for the shop, however many staff and however many invoices, set with the first retailers to come on board and held for them. No per-seat charges, no setup fee, and you keep every file Floda makes.</p>
              <p className="soft" style={{ marginTop: 16 }}>Register below and we&rsquo;ll walk you through it on one of your own supplier invoices, so you can see what it makes of your paperwork before you decide anything.</p>
            </div>
            <div id="register">
              <RegisterForm />
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span><strong>Floda</strong> · supplier paperwork in, shop-ready listings out</span>
          <span>hello@floda.ai · Sydney, Australia</span>
        </div>
      </footer>
    </div>
  );
}
