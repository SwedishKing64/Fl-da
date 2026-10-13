import { prisma, databaseLatency } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { UserForm, DeleteUserButton, Status } from "./SettingsForms";
import { usingBlob, blobTokenSource } from "@/lib/catalog/storage";
import { blobEnvNamesPresent } from "@/lib/catalog/blob-token";

/**
 * Who can sign in, and whether the app is standing on solid ground.
 *
 * There is nothing to configure here. Everything this app does is settled by the shop's own
 * catalogue rather than by a setting, and the things that used to be adjustable — the tone for
 * written copy, the rules, the templates — are changed in the code, where they can be tested.
 *
 * What is left is not a setting: it is a health check. Two of its three lines report a condition
 * that loses work silently — uploads that will not survive the next request, and a database far
 * enough away to be most of why a page feels slow.
 */
export default async function SettingsPage() {
  const me = await requireUser("ADMIN");
  const [users, latency] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    databaseLatency(),
  ]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Admin only." />
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
            aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
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
