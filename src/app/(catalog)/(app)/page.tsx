import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Details, Empty, LinkButton, PageHeader, Stat, fmtDate, statusTone } from "@/app/(catalog)/ui";
import type { ReviewSummary } from "@/lib/catalog/review-types";

export default async function DashboardPage() {
  const [batches, recent, exported, audit] = await Promise.all([
    prisma.importBatch.count(),
    prisma.importBatch.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: { supplier: true, _count: { select: { products: true, files: true } } } }),
    // Capped: this reads a JSON blob per batch, and a shop two seasons in has hundreds. The
    // figures below it are a dashboard headline, not an accounting record.
    prisma.importBatch.findMany({ where: { status: { in: ["EXPORTED", "PUSHED"] } }, select: { summary: true }, orderBy: { exportedAt: "desc" }, take: 200 }),
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
        <Stat label="Import batches" value={batches.toLocaleString("en-AU")} sub={recent.length > 0 ? `last touched ${fmtDate(recent[0].updatedAt)}` : "none yet"} />
        <Stat label="Products exported" value={products.toLocaleString("en-AU")} sub={`across ${exported.length} exported batch${exported.length === 1 ? "" : "es"}`} />
        <Stat label="Variants exported" value={variants.toLocaleString("en-AU")} sub={products > 0 ? `${(variants / products).toFixed(1)} per product` : "—"} />
        <Stat label="Units" value={units.toLocaleString("en-AU")} sub="ordered across those batches" tone="gold" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent batches" className={recent.length === 0 ? "lg:col-span-2" : "lg:col-span-3"} actions={<Link href="/batches" className="text-xs text-[var(--violet)]">All batches</Link>}>
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
        {recent.length === 0 && <Card title="How it works">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-2)]">
            <li><strong>Upload</strong> invoices, spec sheets or product photos. Spreadsheets are read directly; PDFs and photos are read by AI.</li>
            <li><strong>Review</strong> the products in the grid: fix anything, add images, check tags.</li>
            <li><strong>Export</strong> one Shopify CSV per brand (or product type), or push straight to the store.</li>
          </ol>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">Tags, collections and types follow the shop&apos;s own conventions, measured from its catalogue. Prices are the supplier&apos;s recommended retail, less any discount you state for the invoice.</p>
        </Card>}
        <Details summary="Latest activity" className="lg:col-span-3">
          <ul className="divide-y divide-[var(--line-soft)] text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-mono text-xs text-[var(--ink-soft)]">{a.action}</span> {a.batch && <Link href={`/batches/${a.batch.id}`} className="text-[var(--violet)]">{a.batch.name}</Link>}</span>
                <span className="text-xs text-[var(--ink-soft)]">{a.user?.name ?? "system"} · {fmtDate(a.createdAt)}</span>
              </li>
            ))}
            {audit.length === 0 && <li className="py-2 text-[var(--ink-soft)]">No activity yet.</li>}
          </ul>
        </Details>
      </div>
    </>
  );
}

