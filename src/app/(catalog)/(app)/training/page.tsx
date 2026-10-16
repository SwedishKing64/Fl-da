import Link from "next/link";
import { prisma } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { getHouseConventions, getLearnedVocabulary, getWebsiteCategories } from "@/lib/catalog/shop-profile";
import { productTypes } from "@/lib/catalog/taxonomy";
import { houseTagRules } from "@/app/(catalog)/actions";
import { describeLearned } from "@/lib/catalog/learn";
import { CANONICAL_FIELDS } from "@/lib/catalog/types";
import { LearnPanel } from "@/app/(catalog)/(setup)/setup/LearnStep";
import { HouseForm } from "@/app/(catalog)/(setup)/setup/HouseStep";
import { SuppliersStep } from "@/app/(catalog)/(setup)/setup/SuppliersStep";
import { WebsiteForm } from "./WebsiteForm";

export const dynamic = "force-dynamic";
/** Reading several supplier examples, or teaching from a large export, is several requests; each takes the page's limit. */
export const maxDuration = 300;

/**
 * Everything Flöda is taught, in one place: the shop's website (its kinds of product), each
 * supplier's paperwork (how their invoices are laid out), the Shopify export (how products are
 * filed and tagged), and the rules a person sets for every listing. Setup walks through the same
 * things once; this is where they are come back to.
 */
export default async function TrainingPage() {
  await requireUser("ADMIN");
  const [website, learned, house, tagRules, templates, suppliers] = await Promise.all([
    getWebsiteCategories(),
    getLearnedVocabulary(),
    getHouseConventions(),
    houseTagRules(),
    prisma.mappingTemplate.findMany({ orderBy: { updatedAt: "desc" }, include: { supplier: { select: { name: true } } } }),
    prisma.supplier.count(),
  ]);
  const kinds = productTypes();
  return (
    <>
      <PageHeader title="Training and Rules" subtitle="What Flöda has been taught about your shop, your suppliers and your listings, and where to teach it more." />

      <Card title="Your website: the kinds of product" className="mb-6">
        <WebsiteForm saved={website} />
      </Card>

      <Card title="Your suppliers: how their paperwork reads" className="mb-6">
        <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
          Drop in an invoice, an order confirmation or an order form from a supplier and Flöda reads it now, shows what it took every column for, and remembers the corrected layout for that supplier. Their next invoice reads the way this one was left.
          {templates.length > 0 && <> So far <strong>{templates.length}</strong> layout{templates.length === 1 ? " is" : "s are"} remembered across <strong>{suppliers}</strong> supplier{suppliers === 1 ? "" : "s"}.</>}
        </p>
        {templates.length > 0 && (
          <div className="mb-5 overflow-auto rounded-[12px] border border-[var(--line)] bg-white">
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] text-[var(--ink-soft)]"><tr><th className="px-3 py-2 font-semibold">Supplier</th><th className="px-3 py-2 font-semibold">Layout</th><th className="px-3 py-2 font-semibold">Columns mapped</th><th className="px-3 py-2 font-semibold">Last confirmed</th></tr></thead>
              <tbody>
                {templates.map((t) => {
                  let mapped = 0;
                  try { mapped = Object.values(JSON.parse(t.mappings) as Record<string, string>).filter(Boolean).length; } catch {}
                  return (
                    <tr key={t.id} className="border-t border-[var(--line-soft)]">
                      <td className="px-3 py-1.5 font-medium">{t.supplier.name}</td>
                      <td className="px-3 py-1.5">{t.name}</td>
                      <td className="px-3 py-1.5">{mapped}</td>
                      <td className="px-3 py-1.5 text-[12px] text-[var(--ink-soft)]">{fmtDate(t.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <SuppliersStep fields={CANONICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required) }))} templates={templates.length} standalone />
      </Card>

      <Card title="Your Shopify export: how products are filed and tagged" className="mb-6">
        {learned ? (
          <ul className="mb-4 list-disc pl-5 text-[14px]">{describeLearned(learned).map((l) => <li key={l}>{l}</li>)}</ul>
        ) : (
          <p className="mb-4 text-[14px] text-[var(--ink-soft)]">Nothing yet. Your export shows which tags go with each kind of product and how each brand is listed. With the website read above, it is the tags that matter here; the kinds of product come from the site.</p>
        )}
        <LearnPanel learned={learned} kinds={house.kinds} />
      </Card>

      <Card title="Rules: how you list" className="mb-6">
        <p className="mb-5 text-[14px] text-[var(--ink-soft)]">The choices a person makes on every listing, which no export can show: the brand in the title or not, SKUs and barcodes, what you write for weight, the tags certain products always get, and anything else the reader should always do.</p>
        <HouseForm house={house} tagRules={tagRules} kinds={kinds} />
      </Card>

      <p className="text-[13px] text-[var(--ink-soft)]">The shop&apos;s name, country and tax, the reading key and staff accounts are on <Link href="/settings" className="font-semibold text-[var(--meta)]">Settings</Link>.</p>
    </>
  );
}
