import { prisma, parseJson } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import { describeTemplate, type ProductTemplateLike } from "@/lib/catalog/templates";
import { TemplatesEditor, type TemplateRow } from "./TemplatesEditor";

const list = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);

export default async function TemplatesPage() {
  const user = await requireUser();
  const rows = await prisma.productTemplate.findMany({ orderBy: [{ scope: "asc" }, { priority: "asc" }, { name: "asc" }] });

  const templates: TemplateRow[] = rows.map((t) => {
    const metafields = parseJson<Record<string, string>>(t.setMetafields, {});
    const like: ProductTemplateLike = {
      id: t.id,
      name: t.name,
      scope: t.scope as ProductTemplateLike["scope"],
      matchValue: t.matchValue,
      matchProductType: t.matchProductType,
      productType: t.setProductType,
      tags: list(t.addTags),
      collections: list(t.addCollections),
      optionNames: list(t.optionNames),
      metafields,
      priority: t.priority,
      active: t.active,
    };
    return {
      id: t.id,
      name: t.name,
      scope: t.scope,
      matchValue: t.matchValue,
      matchProductType: t.matchProductType,
      sourceFileName: t.sourceFileName,
      productCount: t.productCount,
      setProductType: t.setProductType,
      addTags: t.addTags,
      addCollections: t.addCollections,
      optionNames: t.optionNames,
      setMetafields: metafields,
      priority: t.priority,
      active: t.active,
      summary: describeTemplate(like),
    };
  });

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Teach the importer by example. Upload a Shopify export for a brand or product type and new imports follow the same conventions."
      />
      <Card title="Product templates">
        <TemplatesEditor templates={templates} isAdmin={user.role === "ADMIN"} />
      </Card>
      <p className="mt-4 max-w-3xl text-sm text-[var(--ink-soft)]">
        Templates run before the Rules page, so a rule you wrote by hand always beats a learned convention. Nothing is
        overwritten either way: tags and collections are added to what is already there, and a product type, metafield or
        option name already set on a product is left alone. Use <strong>Apply rules</strong> on a batch to re-run both over
        products that are already imported.
      </p>
    </>
  );
}
