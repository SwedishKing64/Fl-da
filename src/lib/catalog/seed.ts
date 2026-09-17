// Recommended defaults: pricing rules, category rules and a sample supplier. Safe to re-run.

import { prisma } from "./db";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { DEFAULT_TAG_RULES } from "./rules";
import { isValidType } from "./taxonomy";

/**
 * No pricing rules. The price is the supplier's recommended retail, so there is nothing for a
 * margin rule to decide — and a seeded "45% margin" is exactly the kind of invented price this
 * shop does not want. Kept as an empty list rather than deleted so the seeding step below still
 * reads straightforwardly, and so an existing shop's rules are cleared rather than left behind.
 */
export const DEFAULT_PRICING_RULES: { name: string; scope: string; matchValue: string; mode: string; percent: number; roundTo: string; priority: number }[] = [];

export async function seedDefaults(): Promise<{ pricingRules: number; categoryRules: number; tagRules: number }> {
  // Clear any margin rules a previous version seeded: nothing prices off them now, and leaving
  // them in place only invites someone to wonder why a 45% rule exists and does nothing.
  const { count: pricingRules } = await prisma.pricingRule.deleteMany({});
  // A category rule that names a Type the shop does not have writes that Type onto every product
  // it matches — "Apparel" reached the CSV that way, on a shop whose garments are Snow Clothing.
  // The rules are seeded once and then owned by whoever edits them, so only the invalid ones are
  // replaced, and only with the defaults for the same category.
  const categoryRulesRepaired = await repairCategoryRules();
  await repairTagRuleSpelling();

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
 * Correct the spelling of tags on rules already sitting in the database.
 *
 * The seeded rules used to add "Mens", "Womens" and "New Season". None of those is a tag this shop
 * uses: across its 827 exported products not one of the 334 distinct tags has a capital letter, and
 * nothing says "new season" — the four-digit year does that job, and 2026 alone is on 189 of them.
 * A product therefore went out carrying "mens, womens, Womens, Mens": the same two tags twice.
 *
 * Fixing the defaults in code only helps a database seeded afterwards, so the rows already there
 * are corrected too. Only the tag column is touched, and only where it is one of the known-wrong
 * values — a tag someone has typed themselves is left exactly as they wrote it.
 */
const TAG_SPELLING: Record<string, string> = {
  mens: "mens", womens: "womens", kids: "kids",
  "snowboard bindings": "snowboard-bindings",
  // Tags the shop has never used. The year tag covers the season; the terrain shelves are named
  // per sport by the taxonomy ("freeride and powder skis"), not by a flat rule.
  "new season": "", freeride: "", park: "", "all-mountain": "",
};

export async function repairTagRuleSpelling(): Promise<number> {
  const rows = await prisma.tagRule.findMany();
  let repaired = 0;
  for (const row of rows) {
    const fixed = row.addTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.toLowerCase() in TAG_SPELLING ? TAG_SPELLING[t.toLowerCase()] : t))
      .filter(Boolean)
      .join(", ");
    if (fixed === row.addTags) continue;
    await prisma.tagRule.update({ where: { id: row.id }, data: { addTags: fixed } });
    repaired++;
  }
  return repaired;
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
