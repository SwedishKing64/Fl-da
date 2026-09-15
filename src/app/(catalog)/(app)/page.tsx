import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Empty, LinkButton, PageHeader, fmtDate, statusTone } from "@/app/(catalog)/ui";
import type { ReviewSummary } from "@/lib/catalog/review-types";

export default async function DashboardPage() {
  const [batches, recent, exported, audit] = await Promise.all([
    prisma.importBatch.count(),
    prisma.importBatch.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: { supplier: true, _count: { select: { products: true, files: true } } } }),
    prisma.importBatch.findMany({ where: { status: { in: ["EXPORTED", "PUSHED"] } }, select: { summary: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true, batch: true } }),
  ]);

  let products = 0, variants = 0, units = 0;
  for (const b of exported) {
    const s = parseJson<ReviewSummary | null>(b.summary, null);
    if (!s) continue;
    products += s.products;
    variants += s.variants;
    units += s.units;
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Turn supplier invoices and spec sheets into ready-to-import Shopify products." actions={<LinkButton href="/batches/new" variant="primary">New import</LinkButton>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Import batches" value={String(batches)} />
        <Stat label="Products exported" value={String(products)} />
        <Stat label="Variants exported" value={String(variants)} />
        <Stat label="Units" value={String(units)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent batches" className="lg:col-span-2" actions={<Link href="/batches" className="text-xs text-[var(--violet)]">All batches</Link>}>
          {recent.length === 0 ? (
            <Empty>No imports yet. Start by creating a batch and uploading an invoice or spec sheet.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Batch</th><th>Supplier</th><th>Status</th><th className="text-right">Files</th><th className="text-right">Products</th><th className="text-right">Updated</th></tr></thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--line-soft)]">
                    <td className="py-2"><Link href={`/batches/${b.id}`} className="font-medium text-[var(--violet)]">{b.name}</Link></td>
                    <td>{b.supplier?.name ?? "–"}</td>
                    <td><Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge></td>
                    <td className="text-right">{b._count.files}</td>
                    <td className="text-right">{b._count.products}</td>
                    <td className="text-right text-xs text-[var(--ink-soft)]">{fmtDate(b.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="How it works">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-2)]">
            <li><strong>Upload</strong> invoices, spec sheets or product photos. Spreadsheets are read directly; PDFs and photos are read by AI.</li>
            <li><strong>Review</strong> the products in the grid: fix anything, add images, check tags.</li>
            <li><strong>Export</strong> one Shopify CSV per brand (or product type), or push straight to the store.</li>
          </ol>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">Tags, collections and types come from the <Link href="/rules" className="text-[var(--violet)]">Rules</Link> page; prices from <Link href="/pricing" className="text-[var(--violet)]">Pricing</Link>.</p>
        </Card>
        <Card title="Latest activity" className="lg:col-span-3">
          <ul className="divide-y divide-[var(--line-soft)] text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-mono text-xs text-[var(--ink-soft)]">{a.action}</span> {a.batch && <Link href={`/batches/${a.batch.id}`} className="text-[var(--violet)]">{a.batch.name}</Link>}</span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="lift relative overflow-hidden rounded-xl border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <span className="alp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--alp-blue-deep)]">{value}</div>
    </div>
  );
}
