import { prisma, parseJson } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { DEFAULT_CATEGORY_RULES } from "@/lib/catalog/categorize";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import { CategoryRulesEditor } from "./CategoryRulesEditor";
import { TagRulesEditor } from "./TagRulesEditor";

export default async function RulesPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const [tagRules, categoryRules] = await Promise.all([
    prisma.tagRule.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
    prisma.categoryRule.findMany({ orderBy: { priority: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Rules" subtitle="Standing instructions. Every product built from an invoice is put through these, and through them again when the CSV is written." />

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <Step n={1} title="What is it?">
          The <strong>sorting rules</strong> read the product and decide what kind of thing it is — skis, boots, a tent — which
          sets its type and which of its details become variant options rather than metafields.
        </Step>
        <Step n={2} title="What else is true about it?">
          The <strong>labelling rules</strong> then look for anything worth marking: that it is a women&rsquo;s model, that it is
          a freeride ski, that it is next season&rsquo;s. Each one that matches adds its tags.
        </Step>
        <Step n={3} title="Who wins?">
          Every matching rule adds its tags, so order changes nothing there. Order decides one thing: when two rules
          disagree about the <strong>type</strong> or a <strong>metafield</strong>, the one higher up the list wins.
        </Step>
      </section>

      <div className="space-y-6">
        <Card title="Labelling rules" className="rise rise-1">
          <p className="mb-4 text-sm text-[var(--ink-2)]">
            Each rule watches for something in the product and, when it sees it, adds tags and collections — and may settle the
            product type or a metafield. They are listed in the order they are tried. Try one on a real product below before you save it.
          </p>
          <TagRulesEditor
            rules={tagRules.map((r) => ({ id: r.id, name: r.name, matchField: r.matchField, pattern: r.pattern, addTags: r.addTags, addCollections: r.addCollections, setProductType: r.setProductType, setMetafields: parseJson<Record<string, string>>(r.setMetafields, {}), priority: r.priority, active: r.active }))}
            isAdmin={isAdmin}
          />
        </Card>

        <Card title="Sorting rules" className="rise rise-2">
          <p className="mb-4 text-sm text-[var(--ink-2)]">
            These run first and answer a different question: what kind of product is this? The answer sets its default type and
            collections, and decides which of its details — length, size, width, colour — become the options a customer chooses
            between. Anything left over is carried as a metafield.
          </p>
          <CategoryRulesEditor
            rules={(categoryRules.length ? categoryRules : DEFAULT_CATEGORY_RULES.map((r, i) => ({ ...r, id: `default-${i}` }))).map((r) => ({ id: r.id, category: r.category, pattern: r.pattern, productType: r.productType, collections: r.collections, tags: r.tags, option1: r.option1 ?? "", option2: r.option2 ?? "", option3: r.option3 ?? "", priority: r.priority, active: r.active }))}
            usingDefaults={categoryRules.length === 0}
            isAdmin={isAdmin}
          />
        </Card>
      </div>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="lift rounded-xl border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <span className="alp-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{n}</span>
        <h3 className="text-sm font-semibold text-[var(--alp-blue-deep)]">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  );
}
