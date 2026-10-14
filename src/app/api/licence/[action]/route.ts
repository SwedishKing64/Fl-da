import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/catalog/db";
import { normaliseKey, vendorMode, verdictFor, type CheckAnswer } from "@/lib/catalog/licence";

export const runtime = "nodejs";

/**
 * What an installed copy of Flöda asks its vendor: "may this key run?" Answered only on the
 * vendor's own deployment; everywhere else this route does not exist.
 *
 * `activate` and `check` are the same question. Both record when the copy was last heard from,
 * which version it is on and which install it was, so the Clients page can show it.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/licence/[action]">) {
  if (!vendorMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { action } = await ctx.params;
  if (action !== "activate" && action !== "check") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Partial<{ key: string; install: string; shop: string; version: string; platform: string }> | null;
  const key = normaliseKey(String(body?.key ?? ""));
  if (!key) return NextResponse.json({ ok: false, status: "UNKNOWN", why: "That is not a Flöda licence key." } satisfies CheckAnswer);

  const client = await prisma.client.findUnique({ where: { licenceKey: key } });
  const verdict = verdictFor(client);
  if (client) {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        lastSeenAt: new Date(),
        lastVersion: String(body?.version ?? "").slice(0, 40),
        lastInstall: String(body?.install ?? "").slice(0, 80),
        checkIns: { increment: 1 },
        // A copy that names its shop fills in a client made from a lead before the shop was known.
        ...(client.name.trim() ? {} : { name: String(body?.shop ?? "").slice(0, 120) }),
      },
    });
  }
  if (!verdict.ok) return NextResponse.json({ ok: false, status: verdict.status, why: verdict.why } satisfies CheckAnswer);
  return NextResponse.json({ ok: true, client: client!.name, plan: client!.plan, status: verdict.status, expiresAt: verdict.expiresAt } satisfies CheckAnswer);
}
