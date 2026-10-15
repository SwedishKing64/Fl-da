import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/app/Logo";
import { RegisterForm } from "./RegisterForm";
import { Bar, CountUp, Demo, Reveal, Tilt } from "./Motion";
import "./welcome.css";

export const metadata: Metadata = {
  title: "Flöda",
  description: "Supplier paperwork in, shop-ready listings out. Flöda reads invoices, order forms, spec sheets and photographed paperwork into Shopify products, stock updates and price changes, and learns how your shop does it from your own catalogue.",
};

/** The suppliers whose paperwork Flöda already reads; every shop that onboards adds to the list. */
const BRANDS = ["Burton", "Völkl", "Marker", "Dalbello", "Atomic", "Salomon", "Head", "Rossignol", "Osprey", "Spyder", "Helly Hansen", "Oakley", "Smith", "Nemo", "Black Diamond", "Jones", "Union", "Nitro", "Petzl", "Sea to Summit"];

/**
 * The front door. Everything on it is true of the product as it stands today; nothing is
 * promised that is not built. The motion is in Motion.tsx; the look is in welcome.css.
 */
export default function WelcomePage() {
  return (
    <div className="floda">
      <Bar>
        <div className="wrap">
          <Link href="/welcome" className="mark"><Logo size={24} /></Link>
          <nav aria-label="Sections">
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#who">Who it&rsquo;s for</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="bar-ctas">
            <Link href="/login" className="btn btn-grey">Sign in</Link>
            <a href="#register" className="btn btn-meta">Get access</a>
          </div>
        </div>
      </Bar>

      <main>
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
              <a href="#register" className="btn btn-meta btn-lg">Register interest<span aria-hidden>→</span></a>
              <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
            </Reveal>
            <Reveal delay={4} as="p" className="note">A desktop app for Windows and Mac, or hosted. Built inside a working ski and snowboard shop over a full buying season.</Reveal>

            <Reveal delay={3} className="demo-wrap">
              <Tilt>
                <Demo>
                  <div className="window" aria-label="A supplier order form becoming shop listings">
                    <div className="chrome"><i /><i /><i /><span className="url">floda.ai/batches/burton-w27</span><span className="live"><b /> reading</span></div>
                    <div className="pane">
                      <div className="side in-box">
                        <div className="title">What the rep sent, photographed</div>
                        <div className="form-line" style={{ "--i": 0 } as never}><span>10688 CUSTOM CAMBER 154</span><span>3</span><span className="pen">999</span></div>
                        <div className="form-line" style={{ "--i": 1 } as never}><span>10688 CUSTOM CAMBER 158</span><span>2</span><span className="pen">YT 27</span></div>
                        <div className="form-line" style={{ "--i": 2 } as never}><span>13170 FREESTYLE REFLEX M</span><span>4</span><span className="pen">-20%</span></div>
                        <div className="form-line" style={{ "--i": 3 } as never}><span>10406 GORE GLOVE L</span><span>6</span><span className="pen">w/ liner</span></div>
                        <div className="chat"><span className="bubble you">All 2026 jackets 30% off and into clearance</span><span className="bubble floda">Done. 212 cells changed, every one listed below.</span></div>
                      </div>
                      <div className="mid" aria-hidden><span className="beam" /><span className="arrow">→</span></div>
                      <div className="side out-box">
                        <div className="title">What goes into Shopify</div>
                        <div className="listing" style={{ "--i": 0 } as never}>
                          <div><b>Men&rsquo;s Custom Camber Snowboard 2027</b><span className="soft">154, 158 · colour-matched pictures · tech specs from the page</span><div className="tags"><span className="tag">snowboards</span><span className="tag">freestyle and all-mountain boards</span><span className="tag grey">2027</span></div></div>
                          <div className="price">$999.00</div>
                        </div>
                        <div className="listing" style={{ "--i": 1 } as never}>
                          <div><b>Men&rsquo;s Freestyle Re:Flex Bindings 2027</b><span className="soft">stock added to the listing you already have</span><div className="tags"><span className="tag">snowboard-bindings</span><span className="tag grey">20% off</span></div></div>
                          <div className="price">+4</div>
                        </div>
                        <div className="listing" style={{ "--i": 2 } as never}>
                          <div><b>Gore Glove 2027</b><span className="soft">a size you didn&rsquo;t stock before, added as a variant</span><div className="tags"><span className="tag">ski-gloves</span><span className="tag">outdoor</span></div></div>
                          <div className="price">+6</div>
                        </div>
                        <div className="check"><b>✓</b> 3 products · 9 variants · ready to import</div>
                      </div>
                    </div>
                  </div>
                </Demo>
              </Tilt>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------- brands */}
        <section className="brands" aria-label="Suppliers whose paperwork Flöda reads">
          <div className="wrap"><p className="brands-label">Reads the paperwork of</p></div>
          <div className="marquee" aria-hidden>
            <div className="track">
              {[...BRANDS, ...BRANDS].map((b, i) => <span key={`${b}-${i}`}>{b}</span>)}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- stats */}
        <section className="stats">
          <div className="wrap">
            <Reveal className="stat"><div className="num"><CountUp to={967} /></div><p>products across ten Shopify exports, measured before a single tagging rule was written.</p></Reveal>
            <Reveal delay={1} className="stat"><div className="num"><CountUp to={1} /><small>season</small></div><p>of real supplier paperwork: order forms, spec exports, barcode lists, invoices, photographed and scribbled on.</p></Reveal>
            <Reveal delay={2} className="stat"><div className="num"><CountUp to={0} /></div><p>changes to your store without you seeing them first. Flöda writes files; you import them.</p></Reveal>
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
            <ol className="steps">
              <Reveal as="li" delay={0}><span className="n">1</span><div className="ico" aria-hidden>📷</div><h3>Drop in what the supplier sent</h3><p>A spreadsheet, a PDF, or a photo off your phone, pen marks and all. Flöda reads the print and the handwriting: a price in the margin is the RRP, a percentage is the discount, a year is the season.</p></Reveal>
              <Reveal as="li" delay={1}><span className="n">2</span><div className="ico" aria-hidden>🧩</div><h3>It becomes your catalogue&rsquo;s shape</h3><p>Lines are matched to what you already sell by barcode, code or name. New products are named, categorised, tagged and priced the way your shop does it, learned from your own Shopify export.</p></Reveal>
              <Reveal as="li" delay={2}><span className="n">3</span><div className="ico" aria-hidden>✅</div><h3>Check it, then import it</h3><p>Every product in a grid, every changed cell listed. Download a Shopify CSV, or only the kinds of product you&rsquo;re working on today, and import it yourself.</p></Reveal>
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------ product */}
        <section id="product" className="band grey">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow">What it does</span>
              <h2>The jobs a buying season is made of, done in an afternoon.</h2>
            </Reveal>
            <div className="bento">
              <Reveal className="tile big" delay={0}>
                <div className="tile-ui">
                  <div className="ui-row head"><span>Product</span><span>Type</span><span>Tags</span><span>Price</span></div>
                  <div className="ui-row"><span>Mantra M7 177</span><span>Skis</span><span>freeride and powder skis</span><span>$1,299</span></div>
                  <div className="ui-row"><span>Griffon 13 ID</span><span>Ski Bindings</span><span>alpine-bindings</span><span>$399</span></div>
                  <div className="ui-row hl"><span>Mantra M7 inc Griffon</span><span>Ski Packages</span><span>ski packages</span><span>$1,639</span></div>
                  <div className="ui-row"><span>Kore 99 184</span><span>Skis</span><span>frontside and all-mountain skis</span><span>$1,199</span></div>
                </div>
                <h3>New products</h3>
                <p>Invoices and order confirmations into ready-to-import listings: read, joined to the spec sheet and barcode list, named, categorised, tagged, priced, with descriptions, specs and colour-matched pictures from the brand&rsquo;s own page.</p>
              </Reveal>
              <Reveal className="tile" delay={1}>
                <div className="tile-ui chat-ui">
                  <span className="bubble you">Put the Spyder jackets 30% off and into clearance</span>
                  <span className="bubble floda">46 products, 184 cells. Compare-at kept, clearance tag added.</span>
                </div>
                <h3>Prices and stock</h3>
                <p>Changes to what you already sell, said in plain words. A sale, a clearance, a delivery to add to stock, a mount charge. Every cell that moves, shown first.</p>
              </Reveal>
              <Reveal className="tile" delay={2}>
                <div className="tile-ui tidy-ui">
                  <div className="photo"><i /><i /><i /><span className="pen">×3</span></div>
                  <div className="arrow">→</div>
                  <div className="table"><i /><i /><i /></div>
                </div>
                <h3>Tidy a document</h3>
                <p>A photo of scribbled-on paperwork becomes a table you can check, doubtful readings marked, saved as a CSV the other jobs take.</p>
              </Reveal>
              <Reveal className="tile" delay={3}>
                <div className="tile-ui learn-ui">
                  <span className="chip">Road Bikes · 12</span><span className="chip">Helmets · 9</span><span className="chip">bikes</span><span className="chip">mountain-bikes</span><span className="chip on">learned from your export</span>
                </div>
                <h3>Learns your shop</h3>
                <p>Starts blank. Your Shopify export teaches it your kinds of product, your menus, how you spell every tag and what each brand&rsquo;s listings look like.</p>
              </Reveal>
              <Reveal className="tile" delay={4}>
                <div className="tile-ui app-ui"><div className="dock"><span className="win">▣</span><span className="mac"></span></div><span className="lbl">Floda-Setup.exe · Floda.dmg</span></div>
                <h3>Runs on your PC</h3>
                <p>An app for Windows and Mac, with its database on your machine. Or hosted, if you&rsquo;d rather. Your supplier costs never sit on someone else&rsquo;s server unless you choose it.</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- proof */}
        <section className="band night">
          <div className="glow" aria-hidden />
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow dark">Built in a real shop</span>
              <h2>Every rule was settled against real files, not guessed.</h2>
              <p className="lede">The shop it was built in sells skis, snowboards, boots, bindings, outerwear, packs and climbing gear. Its buying season went through Flöda line by line, and every convention the catalogue had was measured before it was written down.</p>
            </Reveal>
            <Reveal delay={1} className="quote-card">
              <p className="quote">&ldquo;A name is the loosest key, so it&rsquo;s the strictest match. Whole words only, never a substring, and a name that fits two products is refused with both named rather than guessed.&rdquo;</p>
              <p className="cite">From the engineering notes. The product is built this carefully all the way down.</p>
            </Reveal>
            <div className="proof">
              <Reveal delay={1}><b>Binding mount charges</b><span>Drill-mount and system bindings told apart by model, so the mount price lands on the right ones.</span></Reveal>
              <Reveal delay={2}><b>Name matches confirmed</b><span>An invoice without barcodes is matched by name and you say whether it&rsquo;s the same product or next year&rsquo;s model.</span></Reveal>
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
              <p className="lede">Specialty retail runs on order forms and PDFs. If your season starts with a pile of them, Flöda is for you.</p>
            </Reveal>
            <div className="fit">
              <Reveal className="card now" delay={0}><span className="label">Ready now</span><h3>Snow and outdoor</h3><p>Skis, boards, boots, bindings and packages, outerwear, packs and climbing gear. Binding mount charges, ski packages and season tagging built in.</p></Reveal>
              <Reveal className="card" delay={1}><span className="label">Starts blank, learns yours</span><h3>Bikes</h3><p>The same supplier paperwork problem, with sizes, colours and model years that change every season.</p></Reveal>
              <Reveal className="card" delay={2}><span className="label">Starts blank, learns yours</span><h3>Fishing, camping, anything specialist</h3><p>Tell us which supplier gives you the most grief and we&rsquo;ll start there.</p></Reveal>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- pricing */}
        <section id="pricing" className="band grey">
          <div className="wrap signup">
            <Reveal>
              <span className="eyebrow">Pricing</span>
              <h2>Founding-retailer pricing.</h2>
              <p className="lede">One flat monthly fee for the shop, however many staff and however many invoices, set with the first retailers to come on board and held for them.</p>
              <ul className="ticks">
                <li>No per-seat charges, no setup fee</li>
                <li>You keep every file Flöda makes</li>
                <li>Windows and Mac app, or hosted</li>
                <li>A walk-through on one of your own invoices before you decide anything</li>
              </ul>
            </Reveal>
            <Reveal delay={1} className="form-card" style={undefined}>
              <div id="register">
                <h3>Register interest</h3>
                <RegisterForm />
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------------- cta */}
        <section className="cta">
          <div className="wrap">
            <Reveal>
              <h2>Your next season&rsquo;s paperwork, read for you.</h2>
              <p className="lede">Register and we&rsquo;ll show you what Flöda makes of one of your own supplier invoices.</p>
              <a href="#register" className="btn btn-meta btn-lg">Get access<span aria-hidden>→</span></a>
            </Reveal>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span className="mark"><Logo size={20} /></span>
          <span>Supplier paperwork in, shop-ready listings out · hello@floda.ai · Sydney</span>
        </div>
      </footer>
    </div>
  );
}
