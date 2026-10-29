import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, Details, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { getHouseConventions, getLearnedVocabulary, getWebsiteCategories, shopName, taxName } from "@/lib/catalog/shop-profile";
import { fieldsInForce, productTypes, snowTrade } from "@/lib/catalog/taxonomy";
import { packagesForTeaching } from "@/lib/catalog/trades/snow/teach";
import { optionPlanFor } from "@/lib/catalog/options";
import { CANONICAL_FIELDS } from "@/lib/catalog/types";
import { LearnPanel } from "@/app/(catalog)/(setup)/setup/LearnStep";
import { SuppliersStep } from "@/app/(catalog)/(setup)/setup/SuppliersStep";
import { WebsiteForm } from "./WebsiteForm";
import { StoreForm } from "./StoreForm";
import { storeState } from "@/lib/catalog/store-sync";
import { oauthApp } from "@/lib/catalog/shopify-oauth";
import { TagProposals } from "./TagProposals";
import { Teach } from "./Teach";
import { Sources, type SourceTile } from "./Sources";
import { buildAreas, countBeliefs } from "@/lib/catalog/teaching";
import { getSettings } from "@/lib/catalog/settings";
import { supplierRecords } from "@/lib/catalog/supplier-score";

export const dynamic = "force-dynamic";
/** Reading several supplier examples, or teaching from a large export, is several requests; each takes the page's limit. */
export const maxDuration = 300;

const n = (x: number) => x.toLocaleString("en-AU");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

/**
 * Where a shop teaches Flöda and sees what it has learned. Three sources at the top — the
 * catalogue export, the website, a supplier's paperwork — and under them everything Flöda now
 * believes about how the shop lists, by area, each belief a sentence that can be changed where it
 * stands or joined by a new rule.
 */
export default async function TrainingPage() {
  await requireUser("ADMIN");
  const [website, learned, house, layouts, tagRules, templates, pricingRules, suppliers, records, settings, store, proposals] = await Promise.all([
    getWebsiteCategories(),
    getLearnedVocabulary(),
    getHouseConventions(),
    prisma.mappingTemplate.findMany({ orderBy: { updatedAt: "desc" }, include: { supplier: { select: { name: true } } } }),
    prisma.tagRule.findMany({ orderBy: { priority: "desc" } }),
    prisma.productTemplate.findMany({ orderBy: { priority: "asc" } }),
    prisma.pricingRule.findMany({ orderBy: { priority: "desc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    supplierRecords().catch(() => []),
    getSettings(),
    storeState(),
    prisma.tagProposal.findMany({ orderBy: [{ status: "desc" }, { count: "desc" }, { createdAt: "asc" }] }).catch(() => []),
  ]);
  const packages = snowTrade() ? await packagesForTeaching(settings.packages) : null;
  const types = productTypes();
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const templateRows = templates.map((t) => ({ id: t.id, name: t.name, scope: t.scope as "BRAND" | "PRODUCT_TYPE" | "CATEGORY", matchValue: t.matchValue, matchProductType: t.matchProductType, notes: t.notes, productType: t.setProductType, tags: list(t.addTags), collections: list(t.addCollections), optionNames: list(t.optionNames), metafields: parseJson<Record<string, string>>(t.setMetafields, {}), priority: t.priority, active: t.active }));
  const areas = buildAreas({
    house,
    learned,
    website,
    types,
    tagRules,
    templates: templateRows,
    pricingRules,
    suppliers,
    layouts: layouts.map((t) => ({ id: t.id, supplier: t.supplier.name, name: t.name, mappings: parseJson<Record<string, string>>(t.mappings, {}), options: parseJson(t.options, {}) })),
    records,
    settings: { seoTone: settings.seoTone, seoTitlePattern: settings.seoTitlePattern, defaultRoundTo: settings.defaultRoundTo, minMarginPct: settings.minMarginPct, gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, houseRules: settings.houseRules, taxName: taxName() },
    fieldLabels: Object.fromEntries(CANONICAL_FIELDS.map((f) => [f.key, f.label])),
    optionPlan: (type) => optionPlanFor(type),
    shopName: shopName(),
    packages,
  });
  const counts = countBeliefs(areas);
  const tags = [...new Set([...(learned?.sections ?? []), ...house.kinds.flatMap((k) => [...k.tags, ...(k.variesTags ?? [])]), ...templateRows.flatMap((t) => t.tags), ...tagRules.flatMap((r) => list(r.addTags))])].sort((a, b) => a.localeCompare(b));
  const brands = [...new Set([...(learned?.vendors ?? []).map((v) => v.name), ...suppliers.map((s) => s.defaultBrand ?? "").filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  const pending = proposals.filter((p) => p.status === "PENDING").length;

  const tiles: SourceTile[] = [
    {
      id: "export",
      title: "Your catalogue export",
      teaches: "Types, tags, titles, variants, prices, descriptions: how you already list.",
      status: learned ? `${plural(learned.products, "product")} and ${plural(learned.types.length, "product type")} from ${learned.file || "your export"}` : store.configured ? "Read from your store" : "Nothing yet",
      taught: Boolean(learned) || store.configured,
      panel: (
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--ink-soft)]">
            In Shopify, export your products as a CSV (one product group at a time is fine) and drop it here. Flöda reads it on your computer and learns which product types you have, the tags that go with each, how titles are written, what each type is sold by, each brand&rsquo;s margin, the shape of your SEO titles and the way your descriptions are laid out. Then it lays the product types out for you to say what each is called and tagged.
          </p>
          <LearnPanel learned={learned} kinds={house.kinds} shop={{ name: shopName(), taxRate: settings.gstRate, pricesIncludeTax: settings.pricesIncludeGst }} />
          <Details summary="Or connect the store" hint={store.configured ? "connected" : "read, not told"} className="!shadow-none">
            <div id="store"><StoreForm state={store} canInstall={Boolean(oauthApp())} /></div>
          </Details>
        </div>
      ),
    },
    {
      id: "website",
      title: "Your website",
      teaches: "The categories your shop is laid out in become the product types.",
      status: website ? `${plural(website.categories.length, "product type")} from ${website.url.replace(/^https?:\/\//, "")}` : "Not read yet",
      taught: Boolean(website),
      panel: (
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--ink-soft)]">Flöda reads your site for its product categories. Tick the ones that are a product type, add any it missed, and every listing&rsquo;s Type is picked from that list; each type can then be given its tags and instructions below.</p>
          <WebsiteForm saved={website} />
        </div>
      ),
    },
    {
      id: "suppliers",
      title: "A supplier's paperwork",
      teaches: "How each supplier's invoices and order forms read.",
      status: layouts.length ? `${plural(layouts.length, "layout")} across ${plural(suppliers.length, "supplier")}` : "No supplier yet",
      taught: layouts.length > 0,
      panel: (
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--ink-soft)]">Drop in one invoice, order confirmation or order form from a supplier. Flöda reads it now, shows what it took every column for, and remembers the corrected layout for that supplier, so their next file reads the way this one was left.</p>
          {layouts.length > 0 && (
            <div className="overflow-auto rounded-[12px] border border-[var(--line)] bg-white">
              <table className="w-full text-[13.5px]">
                <thead className="text-left text-[12px] text-[var(--ink-soft)]"><tr><th className="px-3 py-2 font-semibold">Supplier</th><th className="px-3 py-2 font-semibold">Layout</th><th className="px-3 py-2 font-semibold">Columns mapped</th><th className="px-3 py-2 font-semibold">Last confirmed</th></tr></thead>
                <tbody>
                  {layouts.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--line-soft)]">
                      <td className="px-3 py-1.5 font-medium">{t.supplier.name}</td>
                      <td className="px-3 py-1.5">{t.name}</td>
                      <td className="px-3 py-1.5">{Object.values(parseJson<Record<string, string>>(t.mappings, {})).filter(Boolean).length}</td>
                      <td className="px-3 py-1.5 text-[12px] text-[var(--ink-soft)]">{fmtDate(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SuppliersStep fields={fieldsInForce().map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required) }))} templates={layouts.length} standalone />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Teach Flöda"
        subtitle={<>What Flöda believes about how you list, in plain sentences, and where to teach it more. <strong>{n(counts.taught)}</strong> of these it learned from your shop; <strong>{n(counts.floda)}</strong> are its own defaults until you change them.</>}
      />

      <Sources tiles={tiles} />

      <div id="tags" className="mb-6 scroll-mt-6">
        {pending > 0 ? (
          <Card title={`Needs you: ${plural(pending, "tag")} a build wanted to use`}>
            <TagProposals proposals={proposals.map((t) => ({ id: t.id, tag: t.tag, status: t.status, count: t.count, example: t.example }))} />
          </Card>
        ) : proposals.length > 0 ? (
          <Details summary="Tags proposed by a build" hint="all decided">
            <TagProposals proposals={proposals.map((t) => ({ id: t.id, tag: t.tag, status: t.status, count: t.count, example: t.example }))} />
          </Details>
        ) : null}
      </div>

      <div id="rulebook" className="scroll-mt-6">
        <Teach areas={areas} lists={{ types, tags, brands, taxName: taxName(), houseRules: settings.houseRules, houseNotes: house.notes }} />
      </div>

      <p className="mt-6 text-[13px] text-[var(--ink-soft)]">The shop&apos;s name, country and tax, the reading key and staff accounts are on <Link href="/settings" className="font-semibold text-[var(--meta)]">Settings</Link>. The pricing rules are also on <Link href="/pricing" className="font-semibold text-[var(--meta)]">Pricing</Link>, with a calculator.</p>
    </>
  );
}
