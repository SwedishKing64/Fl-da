import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { DEFAULT_CATEGORY_RULES } from "@/lib/catalog/categorize";
import { Card, PageHeader } from "@/app/catalog/ui";
import { PricingRulesEditor, CategoryRulesEditor, PricingSettingsForm } from "./PricingEditors";

export default async function PricingPage() {
  const user = await requireUser();
  const [rules, categoryRules, settings] = await Promise.all([prisma.pricingRule.findMany({ orderBy: [{ scope: "asc" }, { priority: "desc" }] }), prisma.categoryRule.findMany({ orderBy: { priority: "desc" } }), getSettings()]);
  const isAdmin = user.role === "ADMIN";
  return (
    <>
      <PageHeader title="Pricing & categories" subtitle="Markup rules decide retail prices; category rules decide product type, collections, tags and which attributes become variant options." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Markup / margin rules">
            <p className="mb-3 text-xs text-[var(--ink-soft)]">Most specific rule wins: product (SKU / model code) → brand → category → default. <strong>Margin</strong> = % of the ex-GST sell price; <strong>markup</strong> = % on landed cost (keystone = 100% markup). Prices are rounded up to the chosen ending so the target is never undercut.</p>
            <PricingRulesEditor rules={rules.map((r) => ({ ...r, createdAt: undefined, updatedAt: undefined }))} isAdmin={isAdmin} />
          </Card>
          <Card title="Category rules">
            <p className="mb-3 text-xs text-[var(--ink-soft)]">Case-insensitive regex tested against the product name, type and description. First match by priority wins. Options list which canonical attributes become Option1–3 (length, size, width, colour); everything else becomes metafields.</p>
            <CategoryRulesEditor rules={(categoryRules.length ? categoryRules : DEFAULT_CATEGORY_RULES.map((r, i) => ({ ...r, id: `default-${i}` }))).map((r) => ({ id: r.id, category: r.category, pattern: r.pattern, productType: r.productType, collections: r.collections, tags: r.tags, option1: r.option1 ?? "", option2: r.option2 ?? "", option3: r.option3 ?? "", priority: r.priority, active: r.active }))} usingDefaults={categoryRules.length === 0} isAdmin={isAdmin} />
          </Card>
        </div>
        <Card title="GST, margins & FX"><PricingSettingsForm settings={{ gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct, fxRates: settings.fxRates }} isAdmin={isAdmin} /></Card>
      </div>
    </>
  );
}
