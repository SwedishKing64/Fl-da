import Link from "next/link";
import TopBar from "./TopBar";

const STEPS = [
  { n: "1", h: "A customer replies", p: "Your post-purchase email asks how it went. Every reply — a rating and their words — flows into Afterword." },
  { n: "2", h: "Afterword reads it", p: "Not just a star. It tags the themes (shipping, sizing, quality), scores sentiment, and flags what's urgent." },
  { n: "3", h: "You act", p: "A ranked “fix this first”, drafted replies for unhappy customers, and one-click testimonials from the happy ones." },
];

export default function Home() {
  return (
    <>
      <TopBar />
      <main className="wrap" style={{ paddingBottom: 90 }}>
        <section style={{ textAlign: "center", padding: "72px 0 30px" }}>
          <div className="eyebrow">For small online stores</div>
          <h1 style={{ fontSize: "clamp(2.1rem, 5.4vw, 3.5rem)", lineHeight: 1.04, margin: "16px auto 0", maxWidth: "15ch" }}>
            Stop collecting feedback. Start understanding it.
          </h1>
          <p style={{ color: "var(--ink-2)", fontSize: "clamp(1rem,1.9vw,1.18rem)", maxWidth: "56ch", margin: "18px auto 0" }}>
            Every review app hands you a pile of stars. Afterword reads what customers actually
            <em> say</em> after they buy — themes, urgency, and exactly what to fix first.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
            <Link href="/app" className="btn primary">
              See the live dashboard →
            </Link>
            <Link href="/#how" className="btn">
              How it works
            </Link>
          </div>
          <p className="mono" style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 16 }}>
            Installs on Shopify · reads replies with AI · no pile of stars to sift
          </p>
        </section>

        <section className="panel" style={{ maxWidth: 560, margin: "0 auto", padding: 22 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>
            The email that goes out
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 18, background: "var(--canvas)" }}>
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Subject: How was your linen wrap dress, Hannah?</div>
            <p style={{ marginTop: 12, fontSize: 14.5, color: "var(--ink)" }}>
              Hi Hannah — it&apos;s been a few days since your order arrived. How&apos;s it going?
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              {["😖", "😐", "🙂", "😃", "🤩"].map((e) => (
                <span key={e} style={{ fontSize: 24, border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", background: "var(--paper)" }}>
                  {e}
                </span>
              ))}
            </div>
            <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-soft)" }}>One tap opens a two-line reply box. That&apos;s the whole ask.</p>
          </div>
        </section>

        <section id="how" style={{ padding: "64px 0 0" }}>
          <div style={{ textAlign: "center", marginBottom: 34 }}>
            <div className="eyebrow">How it works</div>
            <h2 style={{ fontSize: "clamp(1.6rem,3.4vw,2.2rem)", marginTop: 10 }}>Collecting is solved. Acting isn&apos;t.</h2>
          </div>
          <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {STEPS.map((s) => (
              <div key={s.n} className="panel" style={{ padding: 22 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--violet-soft)", color: "var(--violet)", display: "grid", placeItems: "center", fontWeight: 800 }}>
                  {s.n}
                </div>
                <h3 style={{ fontSize: 17, margin: "12px 0 7px" }}>{s.h}</h3>
                <p style={{ color: "var(--ink-2)", fontSize: 14 }}>{s.p}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
