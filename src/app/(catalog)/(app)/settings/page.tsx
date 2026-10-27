import Link from "next/link";
import { prisma, databaseLatency } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { UserForm, DeleteUserButton, Status } from "./SettingsForms";
import { BindingListCard } from "./BindingListCard";
import { getBindingList } from "@/lib/catalog/trades/snow/binding-store";
import { DRILL_MOUNT_FEE, SYSTEM_MOUNT_FEE } from "@/lib/catalog/trades/snow/packages";
import { snowTrade } from "@/lib/catalog/taxonomy";
import { usingBlob, blobTokenSource } from "@/lib/catalog/storage";
import { blobEnvNamesPresent } from "@/lib/catalog/blob-token";
import { apiKeySource, keyTail } from "@/lib/catalog/anthropic";
import { getShopProfile, getStoredApiKey } from "@/lib/catalog/shop-profile";
import { ShopForm } from "@/app/(catalog)/(setup)/setup/ShopStep";
import { ApiKeyForm } from "@/app/(catalog)/(setup)/setup/AiStep";
import { LicenceForm } from "./LicenceForm";
import { ShareLayouts } from "./ShareLayouts";
import { Backups } from "./Backups";
import { ShopifyConnect } from "./ShopifyConnect";
import { ShopsCard } from "./ShopsCard";
import { readShopList, renameShop, runningShopId } from "@/lib/catalog/shops";
import { getSettings } from "@/lib/catalog/settings";
import { oauthApp } from "@/lib/catalog/shopify-oauth";
import { backupDir, listBackups, sqliteFile } from "@/lib/catalog/backup";
import { licenceServer } from "@/lib/catalog/licence";
import { currentLicence, getServerOverride, monthUse, readingUsage, servers } from "@/lib/catalog/licence-store";

/**
 * The shop, the people who can sign in, what Flöda has learned, the key it reads with, and
 * whether the app is standing on solid ground.
 *
 * Everything a shop can change about how Flöda works is here or on the setup steps these cards
 * link to. The health check at the end reports the conditions that lose work silently — uploads
 * that will not survive the next request, and a database far enough away to be most of why a page
 * feels slow.
 */
/** Teaching from a large export is several requests; each takes the page's limit. */
export const maxDuration = 300;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ shopify?: string }> }) {
  const me = await requireUser("ADMIN");
  const [users, latency, profile, storedKey, settings, asked, bindingList] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    databaseLatency(),
    getShopProfile(),
    getStoredApiKey(),
    getSettings(),
    searchParams,
    getBindingList().catch(() => null),
  ]);
  // Only the desktop app keeps several shops; anywhere else this is null and the card is not shown.
  // The shop open now goes by its own name there, once it has one, rather than "My shop".
  let shops = await readShopList();
  const mine = shops?.shops.find((s) => s.id === runningShopId());
  if (shops && mine && mine.name === "My shop" && profile.name.trim()) {
    await renameShop(mine.id, profile.name.trim()).catch(() => undefined);
    shops = await readShopList();
  }
  const store = settings.shopify.storeDomain && settings.shopify.accessToken ? { domain: settings.shopify.storeDomain, by: settings.shopify.connectedBy ?? "token" } : null;
  return (
    <>
      <PageHeader title="Settings" subtitle="Admin only." />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card title="Your shop">
            <ShopForm profile={profile} />
          </Card>
          {shops && (
            <div id="shops">
              <Card title="Shops on this computer">
                <ShopsCard list={shops} running={runningShopId()} />
              </Card>
            </div>
          )}
        </div>
        <div className="grid gap-6">
          <Card title="Training and Rules">
            <p className="text-[14px] text-[var(--ink-soft)]">What Flöda is taught lives on its own page: your website&apos;s categories as the product types, each supplier&apos;s paperwork, your Shopify export, and the rules for every listing. <Link href="/training" className="font-semibold text-[var(--meta)]">Open Training and Rules →</Link></p>
          </Card>
          <div id="shopify">
            <Card title="Your Shopify store">
              <ShopifyConnect connected={store} canInstall={Boolean(oauthApp())} outcome={asked.shopify} />
            </Card>
          </div>
          <Card title="Reading documents">
            <ApiKeyForm source={apiKeySource()} tail={keyTail(storedKey)} />
          </Card>
          {licenceServer() && (
            <Card title="Licence">
              <LicenceForm state={await currentLicence()} use={await monthUse()} reading={await readingUsage()} servers={await servers()} override={await getServerOverride()} />
              <ShareLayouts on={settings.shareLayouts !== false} />
            </Card>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Staff accounts">
          <p className="mb-3 text-[13.5px] text-[var(--ink-soft)]">Everyone signs in on this same copy: the batches, suppliers and what Flöda has learned live here, so staff use Flöda on this machine (or a hosted copy you run), not each on an install of their own.</p>
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Name</th><th>Email</th><th>Role</th><th>Added</th><th /></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id} className="border-t border-[var(--line-soft)]"><td className="py-1.5">{u.name}</td><td>{u.email}</td><td>{u.role}</td><td className="text-xs text-[var(--ink-soft)]">{fmtDate(u.createdAt)}</td><td className="text-right">{u.id !== me.id && <DeleteUserButton id={u.id} />}</td></tr>)}</tbody>
          </table>
          <UserForm />
        </Card>
        <Card title="Backups">
          {sqliteFile() ? (
            <Backups backups={listBackups()} db={sqliteFile()!} dir={backupDir(sqliteFile()!)} />
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">This copy&apos;s database is a server (Postgres), which keeps its own backups and point-in-time restore; nothing to do here.</p>
          )}
        </Card>
        <Card title="How this deployment is doing">
          <Status
            aiConfigured={apiKeySource() !== "none"}
            storage={usingBlob() ? "blob" : process.env.VERCEL ? "ephemeral" : "disk"}
            blobFrom={blobTokenSource()}
            blobNames={blobEnvNamesPresent()}
            latency={latency}
          />
        </Card>
      </div>
      {snowTrade() && (
        <Card title="Bindings for ski packages" className="mt-6">
          <BindingListCard initial={bindingList} fees={{ drill: DRILL_MOUNT_FEE, system: SYSTEM_MOUNT_FEE }} />
        </Card>
      )}
    </>
  );
}
