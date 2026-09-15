// Recommended defaults: pricing rules, category rules and a sample supplier. Safe to re-run.

import { prisma } from "./db";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { DEFAULT_TAG_RULES } from "./rules";
import { isValidType } from "./taxonomy";

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

export async function seedDefaults(): Promise<{ pricingRules: number; categoryRules: number; tagRules: number }> {
  let pricingRules = 0;
  for (const r of DEFAULT_PRICING_RULES) {
    const existing = await prisma.pricingRule.findFirst({ where: { name: r.name } });
    if (existing) continue;
    await prisma.pricingRule.create({ data: r });
    pricingRules++;
  }
  // A category rule that names a Type the shop does not have writes that Type onto every product
  // it matches — "Apparel" reached the CSV that way, on a shop whose garments are Snow Clothing.
  // The rules are seeded once and then owned by whoever edits them, so only the invalid ones are
  // replaced, and only with the defaults for the same category.
  const categoryRulesRepaired = await repairCategoryRules();

  let categoryRules = 0;
  if ((await prisma.categoryRule.count()) === 0) {
    for (const r of DEFAULT_CATEGORY_RULES) {
      await prisma.categoryRule.create({ data: { category: r.category, pattern: r.pattern, productType: r.productType, collections: r.collections, tags: r.tags, option1: r.option1 ?? null, option2: r.option2 ?? null, option3: r.option3 ?? null, priority: r.priority, active: r.active } });
      categoryRules++;
    }
  }
  let tagRules = 0;
  if ((await prisma.tagRule.count()) === 0) {
    for (const r of DEFAULT_TAG_RULES) {
      await prisma.tagRule.create({ data: { ...r, setMetafields: typeof r.setMetafields === "string" ? r.setMetafields : JSON.stringify(r.setMetafields) } });
      tagRules++;
    }
  }
  return { pricingRules, categoryRules: categoryRules + categoryRulesRepaired, tagRules };
}

/**
 * Replace category rules whose product type is not a Type this shop has.
 *
 * Returns how many were corrected. Safe to run repeatedly: a rule whose type is valid is left
 * exactly as it is, including any wording someone has edited by hand.
 */
export async function repairCategoryRules(): Promise<number> {
  const rows = await prisma.categoryRule.findMany();
  const broken = rows.filter((r) => r.productType && !isValidType(r.productType));
  if (broken.length === 0) return 0;

  let repaired = 0;
  for (const category of new Set(broken.map((r) => r.category))) {
    const replacements = DEFAULT_CATEGORY_RULES.filter((d) => d.category === category);
    if (replacements.length === 0) continue;
    await prisma.categoryRule.deleteMany({ where: { id: { in: broken.filter((r) => r.category === category).map((r) => r.id) } } });
    for (const r of replacements) {
      await prisma.categoryRule.create({ data: { category: r.category, pattern: r.pattern, productType: r.productType, collections: r.collections, tags: r.tags, option1: r.option1 ?? null, option2: r.option2 ?? null, option3: r.option3 ?? null, priority: r.priority, active: r.active } });
      repaired++;
    }
  }
  return repaired;
}
