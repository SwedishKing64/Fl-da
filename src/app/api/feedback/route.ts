import { NextResponse, type NextRequest } from "next/server";
import { prisma, parseJson } from "@/lib/catalog/db";
import { vendorMode } from "@/lib/catalog/licence";
import { FEEDBACK_KEY, type FeedbackRow } from "@/lib/catalog/feedback-box";

export const runtime = "nodejs";

/**
 * What an installed copy of Flöda sends when someone presses Feedback. Answered only on the
 * vendor's own deployment, where it lands on the Clients page; everywhere else this route does
 * not exist.
 */
export async function POST(req: NextRequest) {
  if (!vendorMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Partial<FeedbackRow> | null;
  const message = String(body?.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ ok: false, error: "Nothing to keep." }, { status: 400 });
  const row: FeedbackRow = {
    at: new Date().toISOString(),
    message,
    email: String(body?.email ?? "").trim().slice(0, 200),
    page: String(body?.page ?? "").slice(0, 200),
    shop: String(body?.shop ?? "").slice(0, 120),
    user: String(body?.user ?? "").slice(0, 120),
    version: String(body?.version ?? "").slice(0, 40),
    install: String(body?.install ?? "").slice(0, 80),
    key: String(body?.key ?? "").slice(0, 40),
  };
  const existing = await prisma.appSetting.findUnique({ where: { key: FEEDBACK_KEY } });
  const rows = parseJson<FeedbackRow[]>(existing?.value, []);
  rows.push(row);
  const value = JSON.stringify(rows.slice(-500));
  await prisma.appSetting.upsert({ where: { key: FEEDBACK_KEY }, create: { key: FEEDBACK_KEY, value }, update: { value } });
  return NextResponse.json({ ok: true });
}
