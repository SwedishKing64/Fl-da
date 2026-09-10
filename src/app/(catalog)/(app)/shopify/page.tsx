import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { ShopifyPanel } from "./ShopifyPanel";

export default async function ShopifyPage() {
  const user = await requireUser();
  const [settings, count, latest] = await Promise.all([getSettings(), prisma.shopifyCatalogItem.count(), prisma.shopifyCatalogItem.findFirst({ orderBy: { syncedAt: "desc" } })]);
  return (
    <>
      <PageHeader title="Shopify" subtitle="Read the live catalog for duplicate detection, and optionally push products straight to the store." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ShopifyPanel isAdmin={user.role === "ADMIN"} config={{ storeDomain: settings.shopify.storeDomain, apiVersion: settings.shopify.apiVersion, hasToken: Boolean(settings.shopify.accessToken) }} locations={settings.locations} />
        <Card title="Catalog cache">
          <p className="text-sm">{count} variants cached{latest ? `, last synced ${fmtDate(latest.syncedAt)}` : ""}.</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">The cache is what batches are compared against to classify each product as new, adds-variants, or update-existing. Sync after big changes in the Shopify admin.</p>
          <h3 className="mt-4 text-sm font-semibold">Setup</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs text-[var(--ink-2)]">
            <li>In Shopify admin: Settings → Apps and sales channels → Develop apps → Create an app.</li>
            <li>Configure Admin API scopes: <code>read_products</code>, <code>write_products</code>, <code>read_inventory</code>, <code>write_inventory</code>, <code>read_locations</code>, <code>write_publications</code> (for collections).</li>
            <li>Install the app and paste the Admin API access token here.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
