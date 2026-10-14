import { prisma, databaseLatency } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { UserForm, DeleteUserButton, Status } from "./SettingsForms";
import { usingBlob, blobTokenSource } from "@/lib/catalog/storage";
import { blobEnvNamesPresent } from "@/lib/catalog/blob-token";
import { apiKeySource, keyTail } from "@/lib/catalog/anthropic";
import { getLearnedVocabulary, getShopProfile, getStoredApiKey } from "@/lib/catalog/shop-profile";
import { describeLearned } from "@/lib/catalog/learn";
import { ShopForm } from "@/app/(catalog)/(setup)/setup/ShopStep";
import { ApiKeyForm } from "@/app/(catalog)/(setup)/setup/AiStep";
import { LearnPanel } from "@/app/(catalog)/(setup)/setup/LearnStep";

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
  const [users, latency, profile, learned, storedKey] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    databaseLatency(),
    getShopProfile(),
    getLearnedVocabulary(),
    getStoredApiKey(),
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
              <p className="mb-4 text-[14px] text-[var(--ink-soft)]">Nothing yet. Flöda learns how you file, tag and name products from your Shopify export.</p>
            )}
            <LearnPanel learned={learned} />
          </Card>
          <Card title="Reading documents">
            <ApiKeyForm source={apiKeySource()} tail={keyTail(storedKey)} />
          </Card>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Staff accounts">
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Name</th><th>Email</th><th>Role</th><th>Added</th><th /></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id} className="border-t border-[var(--line-soft)]"><td className="py-1.5">{u.name}</td><td>{u.email}</td><td>{u.role}</td><td className="text-xs text-[var(--ink-soft)]">{fmtDate(u.createdAt)}</td><td className="text-right">{u.id !== me.id && <DeleteUserButton id={u.id} />}</td></tr>)}</tbody>
          </table>
          <UserForm />
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
