import { prisma, databaseLatency } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { UserForm, DeleteUserButton, Status } from "./SettingsForms";
import { usingBlob, blobTokenSource } from "@/lib/catalog/storage";
import { blobEnvNamesPresent } from "@/lib/catalog/blob-token";
import { apiKeySource, keyTail } from "@/lib/catalog/anthropic";
import { getHouseConventions, getLearnedVocabulary, getShopProfile, getStoredApiKey } from "@/lib/catalog/shop-profile";
import { productTypes } from "@/lib/catalog/taxonomy";
import { houseTagRules } from "@/app/(catalog)/actions";
import { describeLearned } from "@/lib/catalog/learn";
import { ShopForm } from "@/app/(catalog)/(setup)/setup/ShopStep";
import { ApiKeyForm } from "@/app/(catalog)/(setup)/setup/AiStep";
import { LearnPanel } from "@/app/(catalog)/(setup)/setup/LearnStep";
import { HouseForm } from "@/app/(catalog)/(setup)/setup/HouseStep";
import { LicenceForm } from "./LicenceForm";
import { Backups } from "./Backups";
import { backupDir, listBackups, sqliteFile } from "@/lib/catalog/backup";
import { licenceServer } from "@/lib/catalog/licence";
import { currentLicence, getServerOverride, monthUse, servers } from "@/lib/catalog/licence-store";

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

export default async function SettingsPage() {
  const me = await requireUser("ADMIN");
  const [users, latency, profile, learned, storedKey, house, tagRules] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    databaseLatency(),
    getShopProfile(),
    getLearnedVocabulary(),
    getStoredApiKey(),
    getHouseConventions(),
    houseTagRules(),
  ]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Admin only." />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Your shop">
          <ShopForm profile={profile} />
        </Card>
        <div className="grid gap-6">
          <Card title="What Flöda has learned">
            {learned ? (
              <ul className="mb-4 list-disc pl-5 text-[14px]">{describeLearned(learned).map((l) => <li key={l}>{l}</li>)}</ul>
            ) : (
              <p className="mb-4 text-[14px] text-[var(--ink-soft)]">Nothing yet. Flöda learns how you file, tag and name products from your Shopify export, and this card then reads like: &ldquo;14 kinds of product, filed under Snow and Outdoor&rdquo;, &ldquo;shelf tags spelt with hyphens (ski-accessories)&rdquo;, &ldquo;titles lead with the model, not the brand&rdquo;.</p>
            )}
            <LearnPanel learned={learned} />
          </Card>
          <Card title="Reading documents">
            <ApiKeyForm source={apiKeySource()} tail={keyTail(storedKey)} />
          </Card>
          {licenceServer() && (
            <Card title="Licence">
              <LicenceForm state={await currentLicence()} use={await monthUse()} servers={await servers()} override={await getServerOverride()} />
            </Card>
          )}
        </div>
      </div>
      <Card title="How you list" className="mb-6">
        <p className="mb-5 text-[14px] text-[var(--ink-soft)]">The choices a person makes on every listing, which an export cannot show: the brand in the title or not, what the SKU is, what you write for weight, and the tags certain products always get.</p>
        <HouseForm house={house} tagRules={tagRules} kinds={productTypes()} />
      </Card>
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
    </>
  );
}
