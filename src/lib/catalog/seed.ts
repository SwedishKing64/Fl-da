// Recommended defaults: pricing rules, category rules and a sample supplier. Safe to re-run.

import { prisma } from "./db";
import { DEFAULT_CATEGORY_RULES } from "./categorize";

export const DEFAULT_PRICING_RULES = [
  { name: "Default 40% margin", scope: "DEFAULT", matchValue: "", mode: "MARGIN", percent: 40, roundTo: "0.99", priority: 0 },
  { name: "Skis 40% margin", scope: "CATEGORY", matchValue: "skis", mode: "MARGIN", percent: 40, roundTo: "0.99", priority: 0 },
  { name: "Snowboards 40% margin", scope: "CATEGORY", matchValue: "snowboards", mode: "MARGIN", percent: 40, roundTo: "0.99", priority: 0 },
  { name: "Boots 38% margin", scope: "CATEGORY", matchValue: "boots", mode: "MARGIN", percent: 38, roundTo: "0.99", priority: 0 },
  { name: "Bindings 40% margin", scope: "CATEGORY", matchValue: "bindings", mode: "MARGIN", percent: 40, roundTo: "0.99", priority: 0 },
  { name: "Apparel 45% margin", scope: "CATEGORY", matchValue: "apparel", mode: "MARGIN", percent: 45, roundTo: "0.99", priority: 0 },
  { name: "Accessories keystone", scope: "CATEGORY", matchValue: "accessories", mode: "MARKUP", percent: 100, roundTo: "0.99", priority: 0 },
  { name: "Helmets & goggles 45% margin", scope: "CATEGORY", matchValue: "helmets", mode: "MARGIN", percent: 45, roundTo: "0.99", priority: 0 },
  { name: "Goggles 45% margin", scope: "CATEGORY", matchValue: "goggles", mode: "MARGIN", percent: 45, roundTo: "0.99", priority: 0 },
];

export async function seedDefaults(): Promise<{ pricingRules: number; categoryRules: number }> {
  let pricingRules = 0;
  for (const r of DEFAULT_PRICING_RULES) {
    const existing = await prisma.pricingRule.findFirst({ where: { name: r.name } });
    if (existing) continue;
    await prisma.pricingRule.create({ data: r });
    pricingRules++;
  }
  let categoryRules = 0;
  if ((await prisma.categoryRule.count()) === 0) {
    for (const r of DEFAULT_CATEGORY_RULES) {
      await prisma.categoryRule.create({ data: { category: r.category, pattern: r.pattern, productType: r.productType, collections: r.collections, tags: r.tags, option1: r.option1 ?? null, option2: r.option2 ?? null, option3: r.option3 ?? null, priority: r.priority, active: r.active } });
      categoryRules++;
    }
  }
  return { pricingRules, categoryRules };
}
