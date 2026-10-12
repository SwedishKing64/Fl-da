import Link from "next/link";
import { prisma, parseJson } from "@/lib/catalog/db";
import { Badge, Card, Details, Empty, PageHeader, Stat, fmtDate, statusTone } from "@/app/(catalog)/ui";
import type { ReviewSummary } from "@/lib/catalog/review-types";

/**
 * Home. Three jobs the shop comes here to do, each a card you press, and the batches on the way
 * with the one thing to do next on each. The figures that used to lead the page are below the
 * fold: nobody opens this to be told how many variants they have exported.
 */

/** The one thing to do next on a batch, from where it has got to. */
function nextStep(status: string, files: number, products: number): { text: string; href: string; done?: boolean } {
  switch (status) {
    case "EXPORTED":
    case "PUSHED": return { text: "Done — import the file into Shopify", href: "export", done: true };
    case "ROLLED_BACK": return { text: "Rolled back — start again if needed", href: "" };
    case "FAILED": return { text: "Something went wrong — open it", href: "" };
    case "REVIEW": return { text: products > 0 ? "Check the products, then export" : "Build the products", href: products > 0 ? "review" : "" };
    default: return files === 0 ? { text: "Upload the invoice", href: "" } : products === 0 ? { text: "Build the products", href: "" } : { text: "Check the products", href: "review" };
  }
}

const JOBS = [
  {
    href: "/batches/new",
    title: "Add new products",
    text: "An invoice or order confirmation goes in — a spreadsheet, a PDF or a photo — and ready-to-import Shopify products come out, priced and tagged the way the shop does it.",
    go: "Start with an invoice",
    goIcon: "🧾",
    icon: "📦",
  },
  {
    href: "/bulk",
    title: "Change prices or stock",
    text: "Load your shop export, say what should change in plain words — a sale, a clearance, a delivery to add to stock — check the list, download the file.",
    go: "Open prices and stock",
    goIcon: "✨",
    icon: "🏷️",
  },
  {
    href: "/tidy",
    title: "Tidy a photo of paperwork",
    text: "A scribbled-on order confirmation, read into a table you can check, pen marks and all, and saved as a CSV the other two pages take.",
    go: "Read a photo",
    goIcon: "📷",
    icon: "📸",
  },
  {
    href: "/bills",
    title: "Enter invoices in QuickBooks",
    text: "Supplier invoices read for the books — supplier, number, dates, GST, total — checked on screen and saved as one CSV that QuickBooks imports as bills.",
    go: "Read the invoices",
    goIcon: "🧾",
    icon: "📒",
  },
];

export default async function DashboardPage() {
  const [batches, recent, exported, audit] = await Promise.all([
    prisma.importBatch.count(),
    prisma.importBatch.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: { supplier: true, _count: { select: { products: true, files: true } } } }),
    // Capped: this reads a JSON blob per batch, and a shop two seasons in has hundreds. The
    // figures below it are a headline, not an accounting record.
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
  const onTheGo = recent.filter((b) => !["EXPORTED", "PUSHED", "ROLLED_BACK"].includes(b.status));

  return (
    <>
      <PageHeader title="What would you like to do?" subtitle="Pick a job. Each one walks you through it a step at a time." />
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {JOBS.map((j, i) => (
          <Link key={j.href} href={j.href} className={`job lift rise rise-${i + 1}`}>
            <span className="job-ico" aria-hidden>{j.icon}</span>
            <h2>{j.title}</h2>
            <p>{j.text}</p>
            <span className="job-go"><span className="emo-btn" aria-hidden>{j.goIcon}</span>{j.go} <span aria-hidden>→</span></span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={onTheGo.length > 0 ? "Carry on where you left off" : "Recent imports"} className="lg:col-span-3" actions={<Link href="/batches" className="text-[13px] font-medium text-[var(--meta)]">All imports</Link>}>
          {recent.length === 0 ? (
            <Empty>Nothing yet. Press <strong>Add new products</strong> above and upload an invoice to begin.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line-soft)]">
              {recent.map((b) => {
                const step = nextStep(b.status, b._count.files, b._count.products);
                const href = `/batches/${b.id}${step.href ? `/${step.href}` : ""}`;
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/batches/${b.id}`} className="text-[15px] font-semibold text-[var(--ink)] hover:text-[var(--meta)]">{b.name}</Link>
                      <div className="mt-0.5 text-[13px] text-[var(--ink-soft)]">
                        {[b.supplier?.name, `${b._count.files} file${b._count.files === 1 ? "" : "s"}`, `${b._count.products} product${b._count.products === 1 ? "" : "s"}`, fmtDate(b.updatedAt)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge>
                      <Link href={href} className={`next-step ${step.done ? "done" : ""}`}>{step.text}{!step.done && <span aria-hidden>→</span>}</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Details summary="The numbers so far" hint="imports, products and units exported" className="lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Imports" value={batches.toLocaleString("en-AU")} sub={recent.length > 0 ? `last touched ${fmtDate(recent[0].updatedAt)}` : "none yet"} />
            <Stat label="Products exported" value={products.toLocaleString("en-AU")} sub={`across ${exported.length} exported import${exported.length === 1 ? "" : "s"}`} />
            <Stat label="Variants exported" value={variants.toLocaleString("en-AU")} sub={products > 0 ? `${(variants / products).toFixed(1)} per product` : "—"} />
            <Stat label="Units" value={units.toLocaleString("en-AU")} sub="ordered across those imports" tone="gold" />
          </div>
        </Details>

        <Details summary="Latest activity" className="lg:col-span-3">
          <ul className="divide-y divide-[var(--line-soft)] text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-mono text-xs text-[var(--ink-soft)]">{a.action}</span> {a.batch && <Link href={`/batches/${a.batch.id}`} className="text-[var(--meta)]">{a.batch.name}</Link>}</span>
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
