import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/catalog/ui";
import { GeneralSettingsForm, UserForm, DeleteUserButton } from "./SettingsForms";
import { usingBlob } from "@/lib/catalog/storage";

export default async function SettingsPage() {
  const me = await requireUser("ADMIN");
  const [settings, users] = await Promise.all([getSettings(), prisma.user.findMany({ orderBy: { createdAt: "asc" } })]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Admin only." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="General">
          <GeneralSettingsForm settings={{ publicBaseUrl: settings.publicBaseUrl, seoTone: settings.seoTone }} aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} storage={usingBlob() ? "blob" : process.env.VERCEL ? "ephemeral" : "disk"} />
        </Card>
        <Card title="Staff accounts">
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Name</th><th>Email</th><th>Role</th><th>Added</th><th /></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id} className="border-t border-[var(--line-soft)]"><td className="py-1.5">{u.name}</td><td>{u.email}</td><td>{u.role}</td><td className="text-xs text-[var(--ink-soft)]">{fmtDate(u.createdAt)}</td><td className="text-right">{u.id !== me.id && <DeleteUserButton id={u.id} />}</td></tr>)}</tbody>
          </table>
          <UserForm />
        </Card>
      </div>
    </>
  );
}
