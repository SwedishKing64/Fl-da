import { dispatchDue } from "@/lib/schedule";

export const runtime = "nodejs";

// POST /api/cron/dispatch — hit this on a schedule (Vercel Cron, GitHub Action, etc.).
// It sends every follow-up whose send time has arrived.
export async function POST() {
  const sent = await dispatchDue(Date.now());
  return Response.json({ ok: true, sent });
}
