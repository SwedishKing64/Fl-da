// Shopify integration skeleton — REAL flow, hand-rolled with node:crypto (no heavy deps).
// To run it live you need a Shopify Partner app and these env vars (see .env.example):
//   SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, SHOPIFY_APP_URL
// Then a public HTTPS tunnel/host so Shopify can reach /api/auth/callback and the webhooks.
// Env is read at call-time (not module load) so tests can set SHOPIFY_API_SECRET first.

import crypto from "node:crypto";

const env = (key: string): string => process.env[key] ?? "";
export const scopes = (): string => process.env.SHOPIFY_SCOPES ?? "read_orders,read_fulfillments";

export function isConfigured(): boolean {
  return Boolean(env("SHOPIFY_API_KEY") && env("SHOPIFY_API_SECRET") && env("SHOPIFY_APP_URL"));
}

/** Only *.myshopify.com hosts are valid install targets. */
export function validShop(shop: string | null): shop is string {
  return !!shop && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

export function authUrl(shop: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env("SHOPIFY_API_KEY"),
    scope: scopes(),
    redirect_uri: `${env("SHOPIFY_APP_URL")}/api/auth/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/** Verify the HMAC Shopify appends to the OAuth callback query string. */
export function verifyOAuthHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = crypto.createHmac("sha256", env("SHOPIFY_API_SECRET")).update(message).digest("hex");
  return safeEqualHex(digest, hmac);
}

/** Verify the HMAC header Shopify sends on every webhook (base64 over the raw body).
 *  Used by the fulfillment webhook AND the mandatory GDPR compliance webhooks. */
export function verifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac("sha256", env("SHOPIFY_API_SECRET")).update(rawBody, "utf8").digest("base64");
  return safeEqualB64(digest, hmacHeader);
}

export async function exchangeCode(shop: string, code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env("SHOPIFY_API_KEY"), client_secret: env("SHOPIFY_API_SECRET"), code }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Register the fulfillment webhook so we hear about deliveries. */
export async function registerFulfillmentWebhook(shop: string, token: string): Promise<void> {
  await fetch(`https://${shop}/admin/api/2025-07/webhooks.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      webhook: { topic: "orders/fulfilled", address: `${env("SHOPIFY_APP_URL")}/api/webhooks/orders-fulfilled`, format: "json" },
    }),
  });
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
function safeEqualB64(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "base64"), Buffer.from(b, "base64"));
  } catch {
    return false;
  }
}
