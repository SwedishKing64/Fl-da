import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/catalog/db";
import { normaliseKey, vendorMode, verdictFor } from "@/lib/catalog/licence";
import { planOf } from "@/lib/catalog/plans";
import { allowanceOf, limitReachedMessage, periodKey, noUsage, StreamMeter, usageOf, type Usage } from "@/lib/catalog/ai-usage";

export const runtime = "nodejs";
/** A season's sheet can take minutes to read; the copy's own timeout is shorter than this. */
export const maxDuration = 300;

/** The reading service. Pointed elsewhere only by a test that stands in for it. */
const UPSTREAM = (process.env.FLODA_AI_UPSTREAM ?? "").trim().replace(/\/+$/, "") || "https://api.anthropic.com";
/** The only calls passed on: a message, or counting one. Nothing that lists, stores or batches. */
const PASSED = new Set(["v1/messages", "v1/messages/count_tokens"]);

/**
 * Reading through Flöda.
 *
 * A shop on a plan has no key of its own: its copy sends each reading here with its licence key
 * as the bearer token, and this forwards it to the reading service with the vendor's key, passes
 * the answer straight back (streamed when it was streamed), and counts what it used against the
 * shop's fortnight. A paused or ended licence, or a fortnight's allowance used up, is turned away with a
 * message the copy shows as it is. Only on the vendor's own deployment.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/ai/[...path]">) {
  if (!vendorMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { path } = await ctx.params;
  const route = path.join("/");
  if (!PASSED.has(route)) return refuse(404, "not_found_error", "That is not something Flöda passes on to the reading service.");

  const key = normaliseKey((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!key) return refuse(401, "authentication_error", "This copy sent no licence key, so it cannot read through Flöda.");
  const client = await prisma.client.findUnique({ where: { licenceKey: key } });
  const verdict = verdictFor(client);
  if (!client || !verdict.ok) return refuse(403, "floda_error", `${verdict.ok ? "" : verdict.why} Reading through Flöda stops with it. A key of your own under Reading documents in Settings still works.`.trim());
  if (planOf(client.plan).reading === "own-key") return refuse(403, "floda_error", "This plan reads with the shop's own key, not through Flöda. Put your Anthropic key under Reading documents in Settings.");
  const allowance = allowanceOf(client);
  if (allowance.exhausted) return refuse(403, "floda_error", limitReachedMessage());
  const vendorKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!vendorKey) return refuse(503, "api_error", "Flöda's own reading key is not set, so nothing can be read through it right now.");

  const headers = new Headers({
    "x-api-key": vendorKey,
    "content-type": req.headers.get("content-type") ?? "application/json",
    "anthropic-version": req.headers.get("anthropic-version") ?? "2023-06-01",
  });
  const beta = req.headers.get("anthropic-beta");
  if (beta) headers.set("anthropic-beta", beta);

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${route}`, { method: "POST", headers, body: await req.text(), signal: AbortSignal.timeout((maxDuration - 10) * 1000) });
  } catch (err) {
    console.error("[ai relay] could not reach the reading service:", err instanceof Error ? err.message : err);
    return refuse(502, "api_error", "The reading service could not be reached from Flöda.");
  }

  const type = upstream.headers.get("content-type") ?? "application/json";
  const out = new Headers({ "content-type": type, "cache-control": "no-store" });
  const requestId = upstream.headers.get("request-id");
  if (requestId) out.set("request-id", requestId);

  if (upstream.ok && type.includes("text/event-stream") && upstream.body) {
    // The answer goes back as it arrives; a second reader of the same stream counts the tokens.
    const [toCopy, toMeter] = upstream.body.tee();
    after(async () => {
      const meter = new StreamMeter();
      const reader = toMeter.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          meter.feed(decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        console.warn("[ai relay] stream ended early:", err instanceof Error ? err.message : err);
      }
      await record(client.id, meter.end());
    });
    return new Response(toCopy, { status: upstream.status, headers: out });
  }

  const text = await upstream.text();
  if (upstream.ok) {
    let usage: Usage | null = null;
    try { usage = usageOf((JSON.parse(text) as { usage?: unknown }).usage); } catch { /* not a message */ }
    if (usage && !noUsage(usage)) { const u = usage; after(() => record(client.id, u)); }
  }
  return new Response(text, { status: upstream.status, headers: out });
}

/** An error the way the reading service shapes one, so the copy's SDK reads it like any other. */
function refuse(status: number, type: string, message: string) {
  return NextResponse.json({ type: "error", error: { type, message } }, { status });
}

/** Add a reading to the client's fortnight, starting over when a new one has begun. */
async function record(clientId: string, usage: Usage): Promise<void> {
  if (noUsage(usage)) return;
  const month = periodKey();
  try {
    const current = await prisma.client.findUnique({ where: { id: clientId }, select: { aiMonth: true } });
    if (!current) return;
    const counts = { aiInput: usage.input, aiCacheWrite: usage.cacheWrite, aiCacheRead: usage.cacheRead, aiOutput: usage.output, aiCalls: 1 };
    if (current.aiMonth !== month) {
      await prisma.client.update({ where: { id: clientId }, data: { aiMonth: month, ...counts } });
    } else {
      await prisma.client.update({ where: { id: clientId }, data: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { increment: v }])) });
    }
  } catch (err) {
    console.error("[ai relay] could not record a reading:", err instanceof Error ? err.message : err);
  }
}
