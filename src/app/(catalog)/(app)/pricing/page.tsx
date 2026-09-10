import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import type { PricingRuleLike } from "@/lib/catalog/pricing";
import { PricingRulesEditor, PricingSettingsForm } from "./PricingEditors";
import { PriceCalculator } from "./PriceCalculator";

export default async function PricingPage() {
  const user = await requireUser();
  const [rules, settings] = await Promise.all([prisma.pricingRule.findMany({ orderBy: [{ scope: "asc" }, { priority: "desc" }] }), getSettings()]);
  const isAdmin = user.role === "ADMIN";
  const ruleLikes: PricingRuleLike[] = rules.map((r) => ({ id: r.id, name: r.name, scope: r.scope as PricingRuleLike["scope"], matchValue: r.matchValue, mode: r.mode as PricingRuleLike["mode"], percent: r.percent, roundTo: r.roundTo, priority: r.priority, active: r.active }));
  return (
    <>
      <PageHeader title="Pricing" subtitle="Try prices in the calculator, then set the markup rules that price every import automatically." />
      <div className="space-y-6">
        <Card title="Price calculator">
          <PriceCalculator rules={ruleLikes} settings={{ gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct, fxRates: settings.fxRates }} />
        </Card>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="Markup / margin rules">
            <p className="mb-3 text-xs text-[var(--ink-soft)]">Most specific rule wins: product (SKU / model code) → brand → category → default. <strong>Margin</strong> = % of the ex-GST sell price; <strong>markup</strong> = % on landed cost (keystone = 100% markup). Prices round up to the chosen ending.</p>
            <PricingRulesEditor rules={rules.map((r) => ({ ...r, createdAt: undefined, updatedAt: undefined }))} isAdmin={isAdmin} />
          </Card>
          <Card title="GST, margins & FX"><PricingSettingsForm settings={{ gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct, fxRates: settings.fxRates }} isAdmin={isAdmin} /></Card>
        </div>
      </div>
    </>
  );
}
