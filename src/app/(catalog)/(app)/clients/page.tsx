import { allowanceOf, describeAllowance, periodKey } from "@/lib/catalog/ai-usage";
import { describePeriodUse, overPlan, planOf } from "@/lib/catalog/plans";

/** What the copy last said its fortnight held, against the plan; empty until a copy has said. */
function monthLine(c: { plan: string; useMonth: string; monthBatches: number; monthProducts: number }): { text: string; over: boolean } {
  if (c.useMonth !== periodKey()) return { text: "", over: false };
  const plan = planOf(c.plan);
  const use = { invoices: c.monthBatches, products: c.monthProducts };
  return { text: describePeriodUse(plan, use), over: overPlan(plan, use) };
}
import { notFound } from "next/navigation";
import { prisma, parseJson } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { vendorMode } from "@/lib/catalog/licence";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import { ClientsPanel, type ClientRow, type LeadRow } from "./ClientsPanel";
import { FEEDBACK_KEY, type FeedbackRow } from "@/lib/catalog/feedback-box";

export const dynamic = "force-dynamic";

/**
 * Who runs Flöda. Only on the vendor's own deployment: every client's name, plan, standing and
 * key, when their copy last checked in and on what, and the retailers who put their hand up on
 * the landing page and are not clients yet.
 */
export default async function ClientsPage() {
  await requireUser("ADMIN");
  if (!vendorMode()) notFound();
  const [clients, leadsRow, feedbackRow] = await Promise.all([
    prisma.client.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    prisma.appSetting.findUnique({ where: { key: "floda.leads" } }),
    prisma.appSetting.findUnique({ where: { key: FEEDBACK_KEY } }),
  ]);
  const leads = parseJson<LeadRow[]>(leadsRow?.value, []).slice().reverse();
  const feedback = parseJson<FeedbackRow[]>(feedbackRow?.value, []).slice().reverse();
  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id, name: c.name, contact: c.contact, email: c.email, plan: c.plan, status: c.status, licenceKey: c.licenceKey, notes: c.notes, billing: c.billing,
    expiresAt: c.expiresAt?.toISOString() ?? null, lastSeenAt: c.lastSeenAt?.toISOString() ?? null, lastVersion: c.lastVersion, lastInstall: c.lastInstall, checkIns: c.checkIns, createdAt: c.createdAt.toISOString(),
    reading: describeAllowance(allowanceOf(c)), readingExhausted: allowanceOf(c).exhausted, aiCap: (c.aiCapCents / 100).toFixed(c.aiCapCents % 100 === 0 ? 0 : 2),
    month: monthLine(c),
  }));
  return (
    <>
      <PageHeader title="Clients" subtitle="Every shop running Flöda, the key their copy runs under, when it last checked in, and what its reading through Flöda has cost this fortnight. A copy asks about its key when the key is entered and about once a day after that; pausing or ending a client is felt within the day, and stops its reading at once." />
      <Card>
        <ClientsPanel clients={rows} leads={leads} feedback={feedback} />
      </Card>
    </>
  );
}
