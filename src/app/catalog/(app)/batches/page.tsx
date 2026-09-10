import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Empty, LinkButton, PageHeader, fmtDate, money, statusTone } from "@/app/catalog/ui";
import type { ReviewSummary } from "@/lib/catalog/review-types";

export default async function BatchesPage() {
  const batches = await prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, include: { supplier: true, createdBy: true, _count: { select: { products: true, files: true } } } });
  return (
    <>
      <PageHeader title="Import batches" subtitle="Each batch is one set of supplier files that becomes one Shopify CSV." actions={<LinkButton href="/catalog/batches/new" variant="primary">New import</LinkButton>} />
      <Card>
        {batches.length === 0 ? <Empty>No batches yet.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Batch</th><th>Supplier</th><th>Status</th><th className="text-right">Files</th><th className="text-right">Products</th><th className="text-right">Units</th><th className="text-right">Retail (inc GST)</th><th className="text-right">Net profit</th><th>Created</th></tr></thead>
            <tbody>
              {batches.map((b) => {
                const s = parseJson<ReviewSummary | null>(b.summary, null);
                return (
                  <tr key={b.id} className="border-t border-[var(--line-soft)]">
                    <td className="py-2"><Link href={`/catalog/batches/${b.id}`} className="font-medium text-[var(--violet)]">{b.name}</Link></td>
                    <td>{b.supplier?.name ?? "–"}</td>
                    <td><Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge></td>
                    <td className="text-right">{b._count.files}</td>
                    <td className="text-right">{b._count.products}</td>
                    <td className="text-right">{s?.units ?? "–"}</td>
                    <td className="text-right">{s ? money(s.totalRetailIncGst, 0) : "–"}</td>
                    <td className="text-right">{s ? money(s.totalNetProfit, 0) : "–"}</td>
                    <td className="text-xs text-[var(--ink-soft)]">{fmtDate(b.createdAt)} · {b.createdBy.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
