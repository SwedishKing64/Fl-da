import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Empty, LinkButton, PageHeader, fmtDate, statusTone } from "@/app/(catalog)/ui";
import type { ReviewSummary } from "@/lib/catalog/review-types";
import { supplierRecords } from "@/lib/catalog/supplier-score";
import { recordWord } from "@/lib/catalog/supplier-record";

export default async function BatchesPage() {
  const [batches, suppliers] = await Promise.all([
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, include: { supplier: true, createdBy: true, _count: { select: { products: true, files: true } } } }),
    supplierRecords(),
  ]);
  const withRecord = suppliers.filter((s) => s.share !== null);
  return (
    <>
      <PageHeader title="New products" subtitle="Each import is one supplier invoice or order that becomes one Shopify file of new products." actions={<LinkButton href="/batches/new" variant="primary" icon="🧾">Start with an invoice</LinkButton>} />
      {withRecord.length > 0 && (
        <Card title="How each supplier's paperwork reads" className="mb-6">
          <p className="mb-3 text-[13px] text-[var(--ink-soft)]">The share of products somebody had to change on the review grid after reading, over each supplier&rsquo;s finished imports. The ones to watch are at the top.</p>
          <div className="flex flex-wrap gap-2">
            {withRecord.map((s) => {
              const { word, tone } = recordWord(s);
              return (
                <div key={s.supplierId} className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[13.5px]">
                  <span className="font-semibold">{s.name}</span>
                  <Badge tone={tone}>{word}</Badge>
                  <span className="text-[var(--ink-soft)]">{Math.round((s.share ?? 0) * 100)}% changed · {s.imports} import{s.imports === 1 ? "" : "s"}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Card>
        {batches.length === 0 ? <Empty>No batches yet.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Batch</th><th>Supplier</th><th>Status</th><th className="text-right">Files</th><th className="text-right">Products</th><th className="text-right">Units</th><th>Created</th></tr></thead>
            <tbody>
              {batches.map((b) => {
                const s = parseJson<ReviewSummary | null>(b.summary, null);
                return (
                  <tr key={b.id} className="border-t border-[var(--line-soft)]">
                    <td className="py-2"><Link href={`/batches/${b.id}`} className="font-medium text-[var(--violet)]">{b.name}</Link></td>
                    <td>{b.supplier?.name ?? "–"}</td>
                    <td><Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge></td>
                    <td className="text-right">{b._count.files}</td>
                    <td className="text-right">{b._count.products}</td>
                    <td className="text-right">{s?.units ?? "–"}</td>
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
