"use client";

import { useState } from "react";
import Link from "next/link";
import type { Sentiment, Theme } from "@/lib/analyze";
import type { AnalysedItem, Insights } from "@/lib/insights";

const SENT_LABEL: Record<Sentiment, string> = { promoter: "Happy", passive: "Mixed", detractor: "Unhappy" };
const THEME_LABEL: Record<Theme, string> = {
  shipping: "Shipping", quality: "Quality", sizing: "Sizing", support: "Support",
  packaging: "Packaging", value: "Value", "product-love": "Loves it", other: "General",
};
type Filter = "all" | "action" | "happy";

export default function DashboardClient({
  analysed,
  insights,
  live,
}: {
  analysed: AnalysedItem[];
  insights: Insights;
  live: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [published, setPublished] = useState<Set<string>>(new Set());

  const shown = analysed.filter((i) =>
    filter === "all" ? true : filter === "action" ? i.analysis.severity >= 2 : i.analysis.sentiment === "promoter",
  );
  const needAction = analysed.filter((i) => i.analysis.severity >= 2).length;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {}
  }

  return (
    <>
      <header className="bar">
        <div className="wrap bar-in">
          <Link href="/" className="brand">
            <span className="dot" />
            Afterword
          </Link>
          <nav className="bar-nav">
            <span className={`chip ${live ? "promoter" : "passive"}`} title={live ? "Analyzed live by Claude" : "Set ANTHROPIC_API_KEY for live Claude analysis"}>
              <span className="pip" />
              {live ? "Claude · live" : "Sample analysis"}
            </span>
            <span className="mono" style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Wildflower Goods · demo store</span>
          </nav>
        </div>
      </header>

      <main className="wrap" style={{ paddingBottom: 90 }}>
        <div style={{ padding: "28px 0 18px" }}>
          <div className="eyebrow">This week</div>
          <h1 style={{ fontSize: "1.9rem", marginTop: 8 }}>Customer feedback</h1>
        </div>

        {/* tiles */}
        <div className="tiles">
          <div className="panel tile">
            <div className="tile-n" style={{ color: insights.score >= 0 ? "var(--promoter)" : "var(--detractor)" }}>
              {insights.score > 0 ? "+" : ""}
              {insights.score}
            </div>
            <div className="tile-l">Satisfaction score</div>
          </div>
          <div className="panel tile" style={{ gridColumn: "span 2" }}>
            <div className="tile-l" style={{ marginBottom: 10 }}>Sentiment · {insights.total} replies</div>
            <div className="split">
              <span style={{ flex: insights.promoters || 0.001, background: "var(--promoter)" }} />
              <span style={{ flex: insights.passives || 0.001, background: "var(--passive)" }} />
              <span style={{ flex: insights.detractors || 0.001, background: "var(--detractor)" }} />
            </div>
            <div className="split-key">
              <span><i className="pip" style={{ background: "var(--promoter)" }} />{insights.promoters} happy</span>
              <span><i className="pip" style={{ background: "var(--passive)" }} />{insights.passives} mixed</span>
              <span><i className="pip" style={{ background: "var(--detractor)" }} />{insights.detractors} unhappy</span>
            </div>
          </div>
          <div className="panel tile">
            <div className="tile-n" style={{ color: needAction ? "var(--detractor)" : "var(--ink)" }}>{needAction}</div>
            <div className="tile-l">Need a reply</div>
          </div>
        </div>

        <div className="dash-grid">
          {/* what to fix first */}
          <aside className="panel" style={{ padding: 18, alignSelf: "start" }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Fix this first</div>
            {insights.topIssues.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>No recurring issues. Nice.</p>
            ) : (
              insights.topIssues.map((t) => (
                <div key={t.theme} className="fix-row">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{THEME_LABEL[t.theme]}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {t.count} mention{t.count === 1 ? "" : "s"}
                      {t.detractors > 0 ? ` · ${t.detractors} unhappy` : ""}
                    </div>
                  </div>
                  <span
                    className="sev"
                    style={{
                      color: t.maxSeverity >= 3 ? "var(--detractor)" : t.maxSeverity === 2 ? "var(--passive)" : "var(--ink-soft)",
                      background: t.maxSeverity >= 3 ? "var(--detractor-tint)" : t.maxSeverity === 2 ? "var(--passive-tint)" : "var(--canvas)",
                    }}
                  >
                    {t.maxSeverity >= 3 ? "Urgent" : t.maxSeverity === 2 ? "Attention" : "Watch"}
                  </span>
                </div>
              ))
            )}
          </aside>

          {/* feed */}
          <div>
            <div className="filter-row">
              {(["all", "action", "happy"] as const).map((f) => (
                <button key={f} className={`filter ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "action" ? `Needs action · ${needAction}` : "Testimonials"}
                </button>
              ))}
            </div>

            {shown.map((it) => {
              const a = it.analysis;
              return (
                <div key={it.id} className="panel fb" style={{ padding: 16, marginBottom: 12 }}>
                  <div className="fb-top">
                    <div>
                      <span style={{ fontWeight: 700 }}>{it.customer}</span>
                      <span style={{ color: "var(--ink-soft)", fontSize: 13 }}> · {it.product} · {it.orderRef}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {a.severity >= 2 && (
                        <span className="sev" style={{ color: "var(--detractor)", background: "var(--detractor-tint)" }}>
                          {a.severity >= 3 ? "Urgent" : "Reply"}
                        </span>
                      )}
                      <span className={`chip ${a.sentiment}`}>
                        <span className="pip" />
                        {SENT_LABEL[a.sentiment]}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.55 }}>&ldquo;{it.text}&rdquo;</p>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {a.themes.map((th) => (
                      <span key={th} className="tag">{THEME_LABEL[th]}</span>
                    ))}
                    <span className="tag" style={{ color: "var(--violet)", borderColor: "var(--violet-soft)", background: "var(--violet-soft)" }}>
                      AI · {a.summary}
                    </span>
                  </div>

                  <div className="fb-reply">
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>Suggested reply</div>
                    <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{a.suggestedReply}</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="btn small" onClick={() => copy(it.id, a.suggestedReply)}>
                        {copied === it.id ? "Copied ✓" : "Copy reply"}
                      </button>
                      {a.testimonialCandidate &&
                        (published.has(it.id) ? (
                          <span className="btn small" style={{ color: "var(--promoter)", borderColor: "var(--promoter-tint)", background: "var(--promoter-tint)" }}>
                            Published ✓
                          </span>
                        ) : (
                          <button
                            className="btn small primary"
                            onClick={() => setPublished((p) => new Set(p).add(it.id))}
                          >
                            Publish as testimonial
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 20 }}>Nothing here right now.</p>}
          </div>
        </div>
      </main>
    </>
  );
}
