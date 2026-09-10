import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Empty, LinkButton, PageHeader, fmtDate, money, statusTone } from "@/app/catalog/ui";
import type { ReviewSummary } from "@/lib/catalog/review-types";

export default async function DashboardPage() {
  const [batches, recent, exported, audit] = await Promise.all([
    prisma.importBatch.count(),
    prisma.importBatch.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: { supplier: true, _count: { select: { products: true } } } }),
    prisma.importBatch.findMany({ where: { status: { in: ["EXPORTED", "PUSHED"] } }, select: { summary: true, exportedAt: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true, batch: true } }),
  ]);

  let products = 0, variants = 0, units = 0, profit = 0, revenue = 0;
  const monthly = new Map<string, number>();
  for (const b of exported) {
    const s = parseJson<ReviewSummary | null>(b.summary, null);
    if (!s) continue;
    products += s.products;
    variants += s.variants;
    units += s.units;
    profit += s.totalNetProfit;
    revenue += s.totalRetailIncGst;
    const key = (b.exportedAt ?? new Date()).toISOString().slice(0, 7);
    monthly.set(key, (monthly.get(key) ?? 0) + s.totalNetProfit);
  }
  // Rough time-saved estimate: ~4 minutes per variant built by hand in the Shopify admin.
  const minutesSaved = variants * 4;
  const errorRate = (() => {
    const total = exported.map((b) => parseJson<ReviewSummary | null>(b.summary, null)).filter(Boolean) as ReviewSummary[];
    const flagged = total.reduce((s, x) => s + x.warnings, 0);
    const rows = total.reduce((s, x) => s + x.variants, 0);
    return rows ? Math.round((flagged / rows) * 100) : 0;
  })();

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Turn supplier invoices into ready-to-import Shopify products." actions={<LinkButton href="/catalog/batches/new" variant="primary">New import</LinkButton>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Batches" value={String(batches)} />
        <Stat label="Products exported" value={String(products)} />
        <Stat label="Variants exported" value={String(variants)} />
        <Stat label="Units" value={String(units)} />
        <Stat label="Net profit (ex GST)" value={money(profit, 0)} sub={`on ${money(revenue, 0)} retail`} />
        <Stat label="Est. time saved" value={minutesSaved >= 60 ? `${Math.round(minutesSaved / 60)} h` : `${minutesSaved} min`} sub={`${errorRate}% rows carried warnings`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent batches" className="lg:col-span-2" actions={<Link href="/catalog/batches" className="text-xs text-[var(--violet)]">All batches</Link>}>
          {recent.length === 0 ? (
            <Empty>No imports yet. Start by creating a batch and uploading an invoice.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Batch</th><th>Supplier</th><th>Status</th><th className="text-right">Products</th><th className="text-right">Net profit</th><th className="text-right">Updated</th></tr></thead>
              <tbody>
                {recent.map((b) => {
                  const s = parseJson<ReviewSummary | null>(b.summary, null);
                  return (
                    <tr key={b.id} className="border-t border-[var(--line-soft)]">
                      <td className="py-2"><Link href={`/catalog/batches/${b.id}`} className="font-medium text-[var(--violet)]">{b.name}</Link></td>
                      <td>{b.supplier?.name ?? "–"}</td>
                      <td><Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge></td>
                      <td className="text-right">{b._count.products}</td>
                      <td className="text-right">{s ? money(s.totalNetProfit, 0) : "–"}</td>
                      <td className="text-right text-xs text-[var(--ink-soft)]">{fmtDate(b.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Profit by month (exported batches)">
          {monthly.size === 0 ? <Empty>Nothing exported yet.</Empty> : (
            <ul className="space-y-2 text-sm">
              {Array.from(monthly.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([m, v]) => (
                <li key={m} className="flex items-center justify-between"><span>{m}</span><span className="font-medium">{money(v, 0)}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest activity" className="lg:col-span-3">
          <ul className="divide-y divide-[var(--line-soft)] text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-mono text-xs text-[var(--ink-soft)]">{a.action}</span> {a.batch && <Link href={`/catalog/batches/${a.batch.id}`} className="text-[var(--violet)]">{a.batch.name}</Link>}</span>
                <span className="text-xs text-[var(--ink-soft)]">{a.user?.name ?? "system"} · {fmtDate(a.createdAt)}</span>
              </li>
            ))}
            {audit.length === 0 && <li className="py-2 text-[var(--ink-soft)]">No activity yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[var(--ink-soft)]">{sub}</div>}
    </div>
  );
}
