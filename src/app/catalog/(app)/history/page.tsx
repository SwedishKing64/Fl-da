import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Card, Empty, PageHeader, fmtDate } from "@/app/catalog/ui";

export default async function HistoryPage(props: PageProps<"/catalog/history">) {
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const take = 100;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { user: true, batch: true } }),
    prisma.auditLog.count(),
  ]);
  return (
    <>
      <PageHeader title="History" subtitle="Every upload, mapping, edit, export and push, with who did it and when." />
      <Card>
        {logs.length === 0 ? <Empty>Nothing logged yet.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">When</th><th>Who</th><th>Action</th><th>Batch</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => {
                const d = parseJson<Record<string, unknown>>(l.details, {});
                const { snapshot: _s, ...rest } = d;
                void _s;
                return (
                  <tr key={l.id} className="border-t border-[var(--line-soft)] align-top">
                    <td className="whitespace-nowrap py-1.5 text-xs text-[var(--ink-soft)]">{fmtDate(l.createdAt)}</td>
                    <td className="text-xs">{l.user?.name ?? "system"}</td>
                    <td className="font-mono text-xs">{l.action}</td>
                    <td className="text-xs">{l.batch ? <Link href={`/catalog/batches/${l.batch.id}`} className="text-[var(--violet)]">{l.batch.name}</Link> : "–"}</td>
                    <td className="max-w-lg truncate font-mono text-[11px] text-[var(--ink-soft)]" title={JSON.stringify(rest)}>{JSON.stringify(rest)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {total > take && <div className="mt-3 flex gap-2 text-sm">{page > 1 && <Link href={`?page=${page - 1}`} className="text-[var(--violet)]">← Newer</Link>}{page * take < total && <Link href={`?page=${page + 1}`} className="text-[var(--violet)]">Older →</Link>}</div>}
      </Card>
    </>
  );
}
