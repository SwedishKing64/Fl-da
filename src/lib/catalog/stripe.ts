/**
 * Taking payment for a plan, through Stripe, on the vendor's deployment.
 *
 * A shop pays on Stripe's own checkout page: the copy asks its vendor for a checkout link
 * (`/api/licence/checkout`), the person pays there, and Stripe tells the vendor what happened
 * on a webhook (`/api/billing/webhook`). The vendor keeps the client's standing from those
 * events: a paid subscription makes the client ACTIVE on the plan it paid for, a failed renewal
 * pauses it, a cancellation ends it at the end of the period paid for. The copy learns of the
 * change the next time it checks its key. Stripe's customer portal (`/api/licence/portal`) is
 * where a shop changes card or plan or cancels.
 *
 * Stripe is reached with plain fetch and form bodies rather than its SDK: four calls, nothing to
 * keep current. What needs no network — reading a signature, deciding a standing from a
 * subscription — is pure and tested.
 *
 * On the vendor: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and a Stripe price id per plan in
 * STRIPE_PRICE_OWNKEY (monthly), STRIPE_PRICE_STARTER, STRIPE_PRICE_SHOP, STRIPE_PRICE_UNLIMITED
 * (every two weeks). With none set, billing is
 * "not set up" and the copy falls back to asking a person.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { isPlanId, PLANS, planOf, type PlanId } from "./plans";
import { logAudit } from "./audit";

/** Stripe. Pointed elsewhere only by a test that stands in for it. */
const API = (process.env.STRIPE_API_UPSTREAM ?? "").trim().replace(/\/+$/, "") || "https://api.stripe.com";

function secretKey(): string {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim();
}

/** The environment variable holding each plan's Stripe price id. The own-key price recurs monthly, the rest every two weeks. */
export const PRICE_ENV: Record<PlanId, string> = { ownkey: "STRIPE_PRICE_OWNKEY", starter: "STRIPE_PRICE_STARTER", shop: "STRIPE_PRICE_SHOP", unlimited: "STRIPE_PRICE_UNLIMITED" };

export function priceFor(plan: PlanId): string {
  return (process.env[PRICE_ENV[plan]] ?? "").trim();
}

/** Which plan a Stripe price stands for, by the ids in the environment. */
export function planForPrice(priceId: string, env: Record<string, string | undefined> = process.env): PlanId | undefined {
  if (!priceId) return undefined;
  for (const p of PLANS) {
    if ((env[PRICE_ENV[p.id]] ?? "").trim() === priceId) return p.id;
  }
  return undefined;
}

/** True when every piece is in place: the key, the webhook secret and a price for each plan. */
export function stripeConfigured(): boolean {
  return Boolean(secretKey() && (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim() && PLANS.every((p) => priceFor(p.id)));
}

/** Stripe's form encoding: nested keys as `a[b][c]`. */
function form(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => out.push(...(typeof item === "object" ? form(item as Record<string, unknown>, `${key}[${i}]`) : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`])));
    else if (typeof v === "object") out.push(...form(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

async function stripe<T>(method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<T> {
  const key = secretKey();
  if (!key) throw new Error("Billing is not set up on this Flöda.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: method === "POST" ? form(params ?? {}).join("&") : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data) throw new Error(`Stripe answered ${res.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
  return data;
}

// ---------------------------------------------------------------------------------------------
// Checkout and the portal
// ---------------------------------------------------------------------------------------------

export interface CheckoutClient {
  id: string;
  name: string;
  email: string;
  stripeCustomerId: string;
}

/** A Stripe checkout page for this client on this plan. The link is good for a day. */
export async function createCheckout(client: CheckoutClient, plan: PlanId, origin: string): Promise<string> {
  const price = priceFor(plan);
  if (!price) throw new Error(`No Stripe price is set for the ${planOf(plan).name} plan.`);
  const session = await stripe<{ url?: string }>("POST", "/v1/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: client.id,
    ...(client.stripeCustomerId ? { customer: client.stripeCustomerId } : client.email ? { customer_email: client.email } : {}),
    success_url: `${origin}/billing/paid`,
    cancel_url: `${origin}/billing/cancelled`,
    allow_promotion_codes: true,
    metadata: { client: client.id, plan },
    subscription_data: { metadata: { client: client.id, plan } },
  });
  if (!session.url) throw new Error("Stripe made no checkout page.");
  return session.url;
}

/** Stripe's customer portal: card, plan, invoices, cancelling. */
export async function createPortal(customerId: string, origin: string): Promise<string> {
  const session = await stripe<{ url?: string }>("POST", "/v1/billing_portal/sessions", { customer: customerId, return_url: `${origin}/billing/portal-done` });
  if (!session.url) throw new Error("Stripe made no billing page.");
  return session.url;
}

// ---------------------------------------------------------------------------------------------
// The webhook
// ---------------------------------------------------------------------------------------------

/** `t=1700000000,v1=abc,v1=def` → the timestamp and every v1 signature. */
export function parseSignature(header: string): { t: number; v1: string[] } {
  const parts = header.split(",").map((p) => p.trim().split("=", 2));
  const t = Number(parts.find(([k]) => k === "t")?.[1] ?? NaN);
  const v1 = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "").filter(Boolean);
  return { t, v1 };
}

export function signPayload(secret: string, t: number, body: string): string {
  return createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
}

export const SIGNATURE_TOLERANCE_S = 300;

/**
 * The event, if the signature is Stripe's and fresh. Throws otherwise; the route answers 400 and
 * nothing is changed. Pure: the secret and the clock are passed in.
 */
export function verifyWebhook(body: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): StripeEvent {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  if (!header) throw new Error("No Stripe-Signature header.");
  const { t, v1 } = parseSignature(header);
  if (!Number.isFinite(t) || v1.length === 0) throw new Error("The signature header is malformed.");
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_S) throw new Error("The signature is too old.");
  const expected = Buffer.from(signPayload(secret, t, body), "hex");
  const good = v1.some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!good) throw new Error("The signature does not match.");
  const event = JSON.parse(body) as StripeEvent;
  if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error("That is not a Stripe event.");
  return event;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string }; current_period_end?: number }> };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface Standing {
  status: "ACTIVE" | "PAUSED" | "ENDED";
  /** What Stripe said, in a word, for the Clients page: active, past due, cancels 30 Nov, cancelled. */
  billing: string;
  /** When the paid period ends, kept only when the subscription will not renew. */
  expiresAt: Date | null;
  plan?: PlanId;
}

const when = (seconds: number | undefined) => (seconds ? new Date(seconds * 1000) : null);

/**
 * What a subscription means for the client's standing. Paid or in a Stripe trial: active. A
 * renewal that failed: paused until it is paid, and Stripe keeps trying. Cancelled: ended, from
 * the end of the period paid for when that is still ahead.
 */
export function standingFromSubscription(sub: StripeSubscription, env: Record<string, string | undefined> = process.env, now = new Date()): Standing {
  const item = sub.items?.data?.[0];
  const periodEnd = when(item?.current_period_end ?? sub.current_period_end);
  const plan = planForPrice(item?.price?.id ?? "", env) ?? (sub.metadata?.plan && isPlanId(sub.metadata.plan) ? sub.metadata.plan : undefined);
  const date = (d: Date | null) => d?.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) ?? "";
  switch (sub.status) {
    case "active":
    case "trialing":
      if (sub.cancel_at_period_end && periodEnd) return { status: periodEnd > now ? "ACTIVE" : "ENDED", billing: `cancels ${date(periodEnd)}`, expiresAt: periodEnd, plan };
      return { status: "ACTIVE", billing: "active", expiresAt: null, plan };
    case "past_due":
    case "unpaid":
      return { status: "PAUSED", billing: "payment failed", expiresAt: null, plan };
    case "paused":
      return { status: "PAUSED", billing: "paused", expiresAt: null, plan };
    case "canceled":
    case "incomplete_expired":
      return periodEnd && periodEnd > now ? { status: "ACTIVE", billing: `cancelled, paid to ${date(periodEnd)}`, expiresAt: periodEnd, plan } : { status: "ENDED", billing: "cancelled", expiresAt: periodEnd, plan };
    default:
      return { status: "PAUSED", billing: sub.status, expiresAt: null, plan };
  }
}

/** Keep what an event says about a client. Unknown events and unknown clients are ignored. */
export async function applyEvent(event: StripeEvent): Promise<string> {
  const obj = event.data.object;
  if (event.type === "checkout.session.completed") {
    const clientId = String(obj.client_reference_id ?? (obj.metadata as Record<string, string> | undefined)?.client ?? "");
    const customer = typeof obj.customer === "string" ? obj.customer : "";
    const subscription = typeof obj.subscription === "string" ? obj.subscription : "";
    const plan = (obj.metadata as Record<string, string> | undefined)?.plan;
    if (!clientId) return "no client on the session";
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return `no client ${clientId}`;
    await prisma.client.update({
      where: { id: client.id },
      data: {
        status: "ACTIVE",
        expiresAt: null,
        billing: "active",
        stripeCustomerId: customer || client.stripeCustomerId,
        stripeSubscriptionId: subscription || client.stripeSubscriptionId,
        ...(plan && isPlanId(plan) ? { plan, aiCapCents: planOf(plan).readingCapCents } : {}),
      },
    });
    await logAudit("client.paid", { details: { client: client.id, plan, event: event.id } });
    return `client ${client.name} is active`;
  }
  if (event.type.startsWith("customer.subscription.")) {
    const sub = obj as unknown as StripeSubscription;
    const client =
      (sub.metadata?.client ? await prisma.client.findUnique({ where: { id: sub.metadata.client } }) : null) ??
      (await prisma.client.findFirst({ where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: sub.customer }] } }));
    if (!client) return `no client for subscription ${sub.id}`;
    const standing = standingFromSubscription(sub);
    await prisma.client.update({
      where: { id: client.id },
      data: {
        status: standing.status,
        billing: standing.billing,
        expiresAt: standing.expiresAt,
        stripeCustomerId: sub.customer || client.stripeCustomerId,
        stripeSubscriptionId: sub.id,
        ...(standing.plan ? { plan: standing.plan, aiCapCents: planOf(standing.plan).readingCapCents } : {}),
      },
    });
    await logAudit("client.billing", { details: { client: client.id, status: standing.status, billing: standing.billing, event: event.id } });
    return `client ${client.name}: ${standing.billing}`;
  }
  return `ignored ${event.type}`;
}
