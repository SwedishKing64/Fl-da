import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/catalog/db";
import { newLicenceKey, normaliseKey, vendorMode, verdictFor, type CheckAnswer, type TrialAnswer, type TrialRequest } from "@/lib/catalog/licence";
import { planOf, TRIAL_DAYS } from "@/lib/catalog/plans";
import { periodKey } from "@/lib/catalog/ai-usage";
import { createCheckout, createPortal, stripeConfigured } from "@/lib/catalog/stripe";
import { checkAccount } from "@/lib/catalog/account";
import { allowanceOf, periodEnd } from "@/lib/catalog/ai-usage";
import { SUPPORT_EMAIL } from "@/lib/catalog/support";
import { findBlobToken } from "@/lib/catalog/blob-token";

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
  if (action === "trial") return trial(req);
  if (action === "signin") return signin(req);
  if (action === "usage") return usage(req);
  if (action === "checkout") return checkout(req);
  if (action === "portal") return portal(req);
  if (action === "picture") return picture(req);
  if (action !== "activate" && action !== "check") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Partial<{ key: string; install: string; shop: string; version: string; platform: string; monthBatches: number; monthProducts: number }> | null;
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
        ...(typeof body?.monthBatches === "number" ? { useMonth: periodKey(), monthBatches: Math.max(0, Math.round(body.monthBatches)), monthProducts: Math.max(0, Math.round(Number(body.monthProducts) || 0)) } : {}),
        // A copy that names its shop fills in a client made from a lead before the shop was known.
        ...(client.name.trim() ? {} : { name: String(body?.shop ?? "").slice(0, 120) }),
      },
    });
  }
  if (!verdict.ok) return NextResponse.json({ ok: false, status: verdict.status, why: verdict.why } satisfies CheckAnswer);
  return NextResponse.json({ ok: true, client: client!.name, plan: client!.plan, status: verdict.status, expiresAt: verdict.expiresAt } satisfies CheckAnswer);
}

/**
 * A copy starting its trial from inside the app: a client is made on the plan it chose, for
 * TRIAL_DAYS, with the plan's reading allowance, and the key goes straight back. One trial per
 * email address; a second request for the same address is told to enter the key it has.
 */
async function trial(req: NextRequest) {
  // Accounts are made on the website now; a copy that still asks here is sent there.
  if (!process.env.FLODA_TRIAL_FROM_APP) return NextResponse.json({ ok: false, status: "UNKNOWN", why: `Make your account at ${originOf(req)}/account/signup first, then sign in here with the same email and password.` } satisfies TrialAnswer);
  const body = (await req.json().catch(() => null)) as Partial<TrialRequest> | null;
  const shop = String(body?.shop ?? "").trim().slice(0, 120);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!shop || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, status: "UNKNOWN", why: "The shop's name and a working email address are needed." } satisfies TrialAnswer);
  const plan = planOf(String(body?.plan ?? ""));
  const had = await prisma.client.findFirst({ where: { email }, select: { id: true } });
  if (had) return NextResponse.json({ ok: false, status: "UNKNOWN", why: `That email address already has a Flöda account. Enter the key it was sent, or write to ${SUPPORT_EMAIL}.` } satisfies TrialAnswer);
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const client = await prisma.client.create({
    data: { name: shop, email, plan: plan.id, status: "TRIAL", expiresAt, licenceKey: newLicenceKey(), aiCapCents: plan.readingCapCents, lastSeenAt: new Date(), lastVersion: String(body?.version ?? "").slice(0, 40), lastInstall: String(body?.install ?? "").slice(0, 80), checkIns: 1, notes: `Started a trial from the app (${String(body?.platform ?? "").slice(0, 40)}).` },
  });
  return NextResponse.json({ ok: true, key: client.licenceKey, client: client.name, plan: client.plan, status: "TRIAL", expiresAt: expiresAt.toISOString() } satisfies TrialAnswer);
}

/** Where the copy came in from, for Stripe to send the person back to. */
function originOf(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://fl-da.vercel.app";
}

/**
 * A copy asking to pay: a Stripe checkout page for its client on the plan it chose. The copy
 * opens the link in the browser; Stripe tells this deployment when it is paid (the webhook) and
 * the copy sees its new standing the next time it checks its key.
 */
async function checkout(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<{ key: string; plan: string }> | null;
  const key = normaliseKey(String(body?.key ?? ""));
  const client = key ? await prisma.client.findUnique({ where: { licenceKey: key } }) : null;
  if (!client) return NextResponse.json({ ok: false, why: "That is not a Flöda licence key." } satisfies BillingAnswer);
  if (!stripeConfigured()) return NextResponse.json({ ok: false, why: `Paying online is not set up on this Flöda yet. Write to ${SUPPORT_EMAIL} and a person will sort the plan out.` } satisfies BillingAnswer);
  const plan = planOf(String(body?.plan ?? client.plan));
  try {
    const url = await createCheckout(client, plan.id, originOf(req));
    return NextResponse.json({ ok: true, url } satisfies BillingAnswer);
  } catch (err) {
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, why: `The payment page could not be made: ${err instanceof Error ? err.message : "no answer from Stripe"}. Write to ${SUPPORT_EMAIL}.` } satisfies BillingAnswer);
  }
}

/** Stripe's customer portal for a client that has paid: card, plan, invoices, cancelling. */
async function portal(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<{ key: string }> | null;
  const key = normaliseKey(String(body?.key ?? ""));
  const client = key ? await prisma.client.findUnique({ where: { licenceKey: key } }) : null;
  if (!client) return NextResponse.json({ ok: false, why: "That is not a Flöda licence key." } satisfies BillingAnswer);
  if (!client.stripeCustomerId || !stripeConfigured()) return NextResponse.json({ ok: false, why: `This copy has not paid online yet, so there is no billing page for it. Write to ${SUPPORT_EMAIL} to change anything.` } satisfies BillingAnswer);
  try {
    const url = await createPortal(client.stripeCustomerId, originOf(req));
    return NextResponse.json({ ok: true, url } satisfies BillingAnswer);
  } catch (err) {
    console.error("[billing] portal failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, why: `The billing page could not be opened: ${err instanceof Error ? err.message : "no answer from Stripe"}.` } satisfies BillingAnswer);
  }
}

type BillingAnswer = { ok: true; url: string } | { ok: false; why: string };

/**
 * A copy signing in with the shop's website account: the email and password made on the
 * website hand the copy its licence key, and the copy keeps it as if it had been typed. The
 * copy is also counted as heard from, as a check-in is.
 */
async function signin(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<{ email: string; password: string; install: string; version: string; platform: string }> | null;
  const client = await checkAccount(String(body?.email ?? ""), String(body?.password ?? ""));
  if (!client) return NextResponse.json({ ok: false, status: "UNKNOWN", why: `That email and password do not match a Flöda account. Make one at ${originOf(req)}/account/signup, or check the password on the website first.` } satisfies TrialAnswer);
  await prisma.client.update({ where: { id: client.id }, data: { lastSeenAt: new Date(), lastVersion: String(body?.version ?? "").slice(0, 40), lastInstall: String(body?.install ?? "").slice(0, 80), checkIns: { increment: 1 } } });
  const verdict = verdictFor(client);
  return NextResponse.json({ ok: true, key: client.licenceKey, client: client.name, plan: client.plan, status: client.status, expiresAt: verdict.ok ? verdict.expiresAt : (client.expiresAt?.toISOString() ?? null) } satisfies TrialAnswer);
}

/** How much of the fortnight's reading a copy has used, for the bar in its sidebar. */
async function usage(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<{ key: string }> | null;
  const key = normaliseKey(String(body?.key ?? ""));
  const client = key ? await prisma.client.findUnique({ where: { licenceKey: key } }) : null;
  if (!client) return NextResponse.json({ ok: false, why: "That is not a Flöda licence key." } satisfies UsageAnswer);
  const a = allowanceOf(client);
  return NextResponse.json({ ok: true, spentCents: a.spentCents, capCents: a.capCents, exhausted: a.exhausted, calls: a.calls, resetsAt: periodEnd().toISOString(), ownKey: planOf(client.plan).reading === "own-key" } satisfies UsageAnswer);
}

type UsageAnswer = { ok: true; spentCents: number; capCents: number; exhausted: boolean; calls: number; resetsAt: string; ownKey: boolean } | { ok: false; why: string };

/** The most a picture may weigh on its way here: a framed JPEG is well under a megabyte. */
const PICTURE_MAX = 6 * 1024 * 1024;
const PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * A picture from a copy that has nowhere public to keep one: a desktop copy's own address is
 * 127.0.0.1, and Shopify cannot fetch from that. It is kept in Flöda's Blob store under the
 * client's name and the public address goes back, to be written on the listing in place of the
 * brand's. Only a key in good standing may add to the store.
 */
async function picture(req: NextRequest) {
  const key = normaliseKey((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!key) return NextResponse.json({ ok: false, why: "This copy sent no licence key, so its pictures cannot be kept by Flöda." }, { status: 401 });
  const client = await prisma.client.findUnique({ where: { licenceKey: key } });
  const verdict = verdictFor(client);
  if (!client || !verdict.ok) return NextResponse.json({ ok: false, why: `${verdict.ok ? "" : verdict.why} Pictures are kept for copies in good standing.`.trim() }, { status: 403 });
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!PICTURE_TYPES.has(type)) return NextResponse.json({ ok: false, why: "Only a JPEG, PNG, WebP or GIF picture is kept." }, { status: 415 });
  const blob = findBlobToken();
  if (!blob) return NextResponse.json({ ok: false, why: "Flöda has no picture store attached, so the picture stays on your copy." }, { status: 503 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > PICTURE_MAX) return NextResponse.json({ ok: false, why: `A picture must be under ${PICTURE_MAX / 1024 / 1024}MB.` }, { status: 413 });
  const name = (req.headers.get("x-floda-name") ?? "picture").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "picture";
  const { put } = await import("@vercel/blob");
  const month = new Date().toISOString().slice(0, 7);
  const stored = await put(`catalog/pictures/${client.id}/${month}/${crypto.randomUUID().slice(0, 8)}-${name}`, bytes, { access: "public", contentType: type, addRandomSuffix: false, token: blob.token });
  return NextResponse.json({ ok: true, url: stored.url });
}
