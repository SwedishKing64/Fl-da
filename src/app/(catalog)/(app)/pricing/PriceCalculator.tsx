"use client";

import { useMemo, useState } from "react";
import { Field, INPUT, money, pct } from "@/app/(catalog)/ui";
import { priceVariant, selectRule, type PricingRuleLike } from "@/lib/catalog/pricing";
import { CATEGORIES, CURRENCIES, type GstTreatment } from "@/lib/catalog/types";

interface Props {
  rules: PricingRuleLike[];
  settings: { gstRate: number; pricesIncludeGst: boolean; minMarginPct: number; fxRates: Record<string, number> };
}

/** Live "what would this sell for?" calculator. Everything recomputes as you type. */
export function PriceCalculator({ rules, settings }: Props) {
  const [cost, setCost] = useState(450);
  const [currency, setCurrency] = useState("AUD");
  const [fx, setFx] = useState(1);
  const [gst, setGst] = useState<GstTreatment>("EXCLUSIVE");
  const [freight, setFreight] = useState(0);
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState("skis");
  const [brand, setBrand] = useState("");
  const [mode, setMode] = useState<"rule" | "custom">("rule");
  const [customMode, setCustomMode] = useState<"MARGIN" | "MARKUP">("MARGIN");
  const [customPct, setCustomPct] = useState(40);
  const [roundTo, setRoundTo] = useState("0.99");
  const [override, setOverride] = useState<string>("");

  const rule = useMemo<PricingRuleLike | null>(() => {
    if (mode === "custom") return { id: "custom", name: `Custom ${customPct}% ${customMode.toLowerCase()}`, scope: "DEFAULT", matchValue: "", mode: customMode, percent: customPct, roundTo, priority: 0, active: true };
    return selectRule(rules, { category, brand, sku: "", modelCode: "" });
  }, [mode, customMode, customPct, roundTo, rules, category, brand]);

  const result = useMemo(() => {
    try {
      return priceVariant(
        { costPrice: cost || 0, gstTreatment: gst, fxRateToAud: currency === "AUD" ? 1 : fx || 1, freightPerUnitAud: freight || 0, quantity: qty || 1, rule, retailOverride: override.trim() === "" ? null : Number(override) },
        settings,
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) } as const;
    }
  }, [cost, gst, currency, fx, freight, qty, rule, override, settings]);

  const pickCurrency = (c: string) => {
    setCurrency(c);
    setFx(c === "AUD" ? 1 : settings.fxRates[c] ?? 1);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit cost on invoice"><input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(Number(e.target.value))} className={INPUT} /></Field>
        <Field label="Cost GST"><select value={gst} onChange={(e) => setGst(e.target.value as GstTreatment)} className={INPUT}><option value="EXCLUSIVE">Ex GST</option><option value="INCLUSIVE">Inc GST</option><option value="NONE">No GST (overseas)</option></select></Field>
        <Field label="Currency"><select value={currency} onChange={(e) => pickCurrency(e.target.value)} className={INPUT}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="FX → AUD"><input type="number" step="0.0001" value={currency === "AUD" ? 1 : fx} disabled={currency === "AUD"} onChange={(e) => setFx(Number(e.target.value))} className={INPUT} /></Field>
        <Field label="Freight per unit (AUD)"><input type="number" step="0.01" min="0" value={freight} onChange={(e) => setFreight(Number(e.target.value))} className={INPUT} /></Field>
        <Field label="Quantity"><input type="number" step="1" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={INPUT} /></Field>
        <Field label="Pricing" className="col-span-2">
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1"><input type="radio" checked={mode === "rule"} onChange={() => setMode("rule")} /> Use my rules</label>
            <label className="flex items-center gap-1"><input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Custom margin / markup</label>
          </div>
        </Field>
        {mode === "rule" ? (
          <>
            <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field label="Brand (optional)"><input value={brand} onChange={(e) => setBrand(e.target.value)} className={INPUT} placeholder="Atomic" /></Field>
          </>
        ) : (
          <>
            <Field label="Mode"><select value={customMode} onChange={(e) => setCustomMode(e.target.value as "MARGIN" | "MARKUP")} className={INPUT}><option value="MARGIN">Margin (% of sell price)</option><option value="MARKUP">Markup (% on cost)</option></select></Field>
            <Field label={`${customMode === "MARGIN" ? "Margin" : "Markup"} ${customPct}%`}><input type="range" min={0} max={customMode === "MARGIN" ? 90 : 300} step={1} value={customPct} onChange={(e) => setCustomPct(Number(e.target.value))} className="w-full" /><input type="number" step="0.5" value={customPct} onChange={(e) => setCustomPct(Number(e.target.value))} className={`${INPUT} mt-1`} /></Field>
            <Field label="Price ending"><select value={roundTo} onChange={(e) => setRoundTo(e.target.value)} className={INPUT}>{["0.99", "0.95", "1.00", "5.00", "10.00", "NONE"].map((r) => <option key={r}>{r}</option>)}</select></Field>
          </>
        )}
        <Field label="Or type a retail price (inc GST)" className="col-span-2" hint="Leave blank to use the rule. Profit and margin update as you type."><input type="number" step="0.01" min="0" value={override} onChange={(e) => setOverride(e.target.value)} className={INPUT} placeholder="e.g. 799" /></Field>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
        {"error" in result ? (
          <div className="text-sm text-red-700">{result.error}</div>
        ) : (
          <>
            <div className="mb-3 text-xs text-[var(--ink-soft)]">Rule: <strong>{result.ruleName}</strong>{mode === "rule" && !rule && " (no rule matched, using the fallback)"}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Retail price (inc GST)</div>
            <div className="text-4xl font-semibold tabular-nums">{money(result.retailPrice)}</div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row k="Landed cost (ex GST, AUD)" v={money(result.landedCostAud)} />
              <Row k="Ex-GST revenue" v={money(result.exGstRevenue)} />
              <Row k="GST collected" v={money(result.gstComponent)} />
              <Row k="Profit per unit (ex GST)" v={money(result.profitPerUnit)} strong tone={result.profitPerUnit < 0 ? "bad" : undefined} />
              <Row k="Margin" v={pct(result.marginPct)} tone={result.lowMargin ? "warn" : undefined} />
              <Row k="Markup on cost" v={pct(result.markupPct)} />
              <Row k={`Profit for ${qty} unit${qty === 1 ? "" : "s"}`} v={money(result.lineProfit)} />
              <Row k={`Revenue for ${qty} unit${qty === 1 ? "" : "s"} (inc GST)`} v={money(result.lineRevenueIncGst)} />
            </dl>
            {result.lowMargin && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Below your minimum margin of {settings.minMarginPct}%.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "bad" | "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--ink-soft)]">{k}</dt>
      <dd className={["m-0 tabular-nums", strong ? "font-semibold" : "font-medium", tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : ""].join(" ")}>{v}</dd>
    </div>
  );
}
