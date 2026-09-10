import { prisma, parseJson } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { DEFAULT_CATEGORY_RULES } from "@/lib/catalog/categorize";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import { CategoryRulesEditor } from "../pricing/PricingEditors";
import { TagRulesEditor } from "./TagRulesEditor";

export default async function RulesPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const [tagRules, categoryRules] = await Promise.all([prisma.tagRule.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }), prisma.categoryRule.findMany({ orderBy: { priority: "desc" } })]);
  return (
    <>
      <PageHeader title="Rules" subtitle="Every product gets its tags, collections, type and metafields from these rules when it is built and again when the CSV is generated." />
      <div className="space-y-6">
        <Card title="Tag & collection rules">
          <p className="mb-3 text-xs text-[var(--ink-soft)]">A rule looks at a field (or everything) with a pattern; when it matches, it adds tags and collections, and can set the product type or ski metafields. Higher priority runs first. Test any rule with a sample product before saving.</p>
          <TagRulesEditor rules={tagRules.map((r) => ({ id: r.id, name: r.name, matchField: r.matchField, pattern: r.pattern, addTags: r.addTags, addCollections: r.addCollections, setProductType: r.setProductType, setMetafields: parseJson<Record<string, string>>(r.setMetafields, {}), priority: r.priority, active: r.active }))} isAdmin={isAdmin} />
        </Card>
        <Card title="Category & option rules">
          <p className="mb-3 text-xs text-[var(--ink-soft)]">Decides what a product is (skis, boots, bindings…), its default type, collections and tags, and which attributes become Shopify variant options (length, size, width, colour). Everything else becomes metafields.</p>
          <CategoryRulesEditor rules={(categoryRules.length ? categoryRules : DEFAULT_CATEGORY_RULES.map((r, i) => ({ ...r, id: `default-${i}` }))).map((r) => ({ id: r.id, category: r.category, pattern: r.pattern, productType: r.productType, collections: r.collections, tags: r.tags, option1: r.option1 ?? "", option2: r.option2 ?? "", option3: r.option3 ?? "", priority: r.priority, active: r.active }))} usingDefaults={categoryRules.length === 0} isAdmin={isAdmin} />
        </Card>
      </div>
    </>
  );
}
