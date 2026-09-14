"use client";

import { useMemo, useState } from "react";
import { Field, INPUT, money, pct } from "@/app/(catalog)/ui";
import { priceVariant, type PricingRuleLike } from "@/lib/catalog/pricing";
import type { GstTreatment } from "@/lib/catalog/types";

interface Props {
  settings: { gstRate: number; pricesIncludeGst: boolean; minMarginPct: number; fxRates: Record<string, number> };
}

const ENDINGS = ["0.99", "0.95", "1.00", "5.00", "10.00", "NONE"];
const MAX_MARGIN = 90;
const clamp = (n: number) => Math.min(MAX_MARGIN, Math.max(0, n));

/**
 * Live pricing. Every input recomputes the price immediately, and it works in both directions:
 * drag the margin and the price follows, type a price and the margin slider moves to match it.
 */
export function PriceCalculator({ settings }: Props) {
  const [cost, setCost] = useState(450);
  const [gst, setGst] = useState<GstTreatment>("EXCLUSIVE");
  const [freight, setFreight] = useState(0);
  const [qty, setQty] = useState(1);
  const [margin, setMargin] = useState(40);
  const [roundTo, setRoundTo] = useState("0.99");
  const [override, setOverride] = useState<string>("");

  const typedPrice = override.trim() === "" ? null : Number(override);
  const usingTypedPrice = typedPrice !== null && Number.isFinite(typedPrice) && typedPrice >= 0;

  const rule = useMemo<PricingRuleLike>(
    () => ({ id: "calculator", name: `${margin}% margin`, scope: "DEFAULT", matchValue: "", mode: "MARGIN", percent: margin, roundTo, priority: 0, active: true }),
    [margin, roundTo],
  );

  const result = useMemo(() => {
    try {
      return priceVariant(
        {
          costPrice: cost || 0,
          gstTreatment: gst,
          fxRateToAud: 1,
          freightPerUnitAud: freight || 0,
          quantity: qty || 1,
          rule,
          retailOverride: usingTypedPrice ? typedPrice : null,
        },
        settings,
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) } as const;
    }
  }, [cost, gst, freight, qty, rule, usingTypedPrice, typedPrice, settings]);

  // The slider shows the margin actually being achieved, so typing a price moves it.
  const shownMargin = "error" in result ? margin : usingTypedPrice ? clamp(result.marginPct) : margin;

  /** Dragging the margin takes back control from a typed price. */
  const dragMargin = (value: number) => {
    if (usingTypedPrice) setOverride("");
    setMargin(clamp(value));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit cost on invoice">
          <input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(Number(e.target.value))} className={INPUT} />
        </Field>
        <Field label="Cost GST">
          <select value={gst} onChange={(e) => setGst(e.target.value as GstTreatment)} className={INPUT}>
            <option value="EXCLUSIVE">Ex GST</option>
            <option value="INCLUSIVE">Inc GST</option>
            <option value="NONE">No GST (overseas)</option>
          </select>
        </Field>
        <Field label="Freight per unit">
          <input type="number" step="0.01" min="0" value={freight} onChange={(e) => setFreight(Number(e.target.value))} className={INPUT} />
        </Field>
        <Field label="Quantity">
          <input type="number" step="1" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={INPUT} />
        </Field>

        <div className="col-span-2 rounded-lg border border-[var(--line-soft)] bg-[var(--canvas)] p-3">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="margin-slider" className="text-sm font-medium text-[var(--ink-2)]">Margin</label>
            <output id="margin-value" htmlFor="margin-slider" className="tabular-nums text-2xl font-semibold leading-none">{shownMargin.toFixed(1)}%</output>
          </div>
          <input
            id="margin-slider"
            type="range"
            min={0}
            max={MAX_MARGIN}
            step={0.5}
            value={shownMargin}
            onChange={(e) => dragMargin(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--violet)]"
          />
          <div className="flex justify-between text-[11px] tabular-nums text-[var(--ink-soft)]">
            <span>0%</span>
            <span>{MAX_MARGIN}%</span>
          </div>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            {usingTypedPrice
              ? "Reading the margin from the price you typed. Drag the slider to go back to setting the margin."
              : "Percentage of the ex-GST sell price. Drag it and the retail price updates as you go."}
          </p>
        </div>

        <Field label="Price ending" hint={usingTypedPrice ? "Not applied while you are typing a price" : "Retail rounds up to this ending"}>
          <select value={roundTo} onChange={(e) => setRoundTo(e.target.value)} disabled={usingTypedPrice} className={INPUT}>
            {ENDINGS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Or type a retail price (inc GST)" hint="Leave blank to price from the margin">
          <input type="number" step="0.01" min="0" value={override} onChange={(e) => setOverride(e.target.value)} className={INPUT} placeholder="e.g. 799" />
        </Field>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
        {"error" in result ? (
          <div className="text-sm text-red-700">{result.error}</div>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Retail price (inc GST)</div>
            <div className="text-4xl font-semibold tabular-nums">{money(result.retailPrice)}</div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row k="Landed cost (ex GST)" v={money(result.landedCostAud)} />
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
