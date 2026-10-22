/**
 * Connecting a shop to Flöda the way Shopify asks of apps since January 2026: the shop owner clicks
 * an install link, approves Flöda's access on their own store, and Shopify sends them back with a
 * code that Flöda trades for an access token. Nobody creates a custom app or pastes a token.
 *
 * The token asked for is an expiring offline one: it lasts an hour, and the refresh token that
 * comes with it (good for 90 days, renewed on every refresh) gets the next. Shopify added these in
 * December 2025 and steers apps to them; a token that cannot leak forever is the safer one to hold.
 *
 * Needs the app's client ID and secret from Shopify's Dev Dashboard (SHOPIFY_CLIENT_ID,
 * SHOPIFY_CLIENT_SECRET) and the address Flöda is served from (FLODA_APP_URL), which must be
 * listed as an allowed redirect on the app. A copy without them keeps the pasted-token way.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** What Flöda does on a store: reads and writes products and their stock, reads its locations. */
export const SCOPES = "read_products,write_products,read_inventory,write_inventory,read_locations";

export interface OAuthApp {
  clientId: string;
  clientSecret: string;
  /** Where Flöda is served from, e.g. https://fl-da.vercel.app. */
  appUrl: string;
}

/** The app's credentials, or null where this copy has none and connects by pasted token. */
export function oauthApp(env: Record<string, string | undefined> = process.env): OAuthApp | null {
  const clientId = env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim();
  const appUrl = (env.FLODA_APP_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).trim().replace(/\/+$/, "");
  return clientId && clientSecret && appUrl ? { clientId, clientSecret, appUrl } : null;
}

export const CALLBACK_PATH = "/api/shopify/callback";

/**
 * A store's own address, as Shopify issues them: "name.myshopify.com". Anything else — a custom
 * domain, a path, a different host — is refused, because the code is sent wherever this points.
 */
export function shopDomain(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const bare = /^[a-z0-9][a-z0-9-]*$/.test(s) ? `${s}.myshopify.com` : s;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(bare) ? bare : null;
}

/** A one-off value tying Shopify's reply to the request that sent the shop owner there. */
export function newState(): string {
  return randomBytes(16).toString("hex");
}

/** The page on the shop's own admin where its owner approves Flöda. Empty grant options: an offline token. */
export function authorizeUrl(app: OAuthApp, shop: string, state: string): string {
  const q = new URLSearchParams({ client_id: app.clientId, scope: SCOPES, redirect_uri: `${app.appUrl}${CALLBACK_PATH}`, state });
  return `https://${shop}/admin/oauth/authorize?${q.toString()}`;
}

/**
 * Whether Shopify signed the reply. The query, less the signature, sorted by name and joined as
 * name=value&…, signed with the app's secret (HMAC-SHA256, hex): anyone can make up a query, only
 * Shopify can sign one.
 */
export function signedByShopify(query: URLSearchParams, secret: string): boolean {
  const given = query.get("hmac") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const message = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest();
  const got = Buffer.from(given, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A store's token as Flöda keeps it. */
export interface StoreToken {
  accessToken: string;
  scope: string;
  /** When the access token stops working (ms since epoch); 0 for a token that does not expire. */
  expiresAt: number;
  refreshToken: string;
  /** When the refresh token stops working (ms since epoch); 0 where there is none. */
  refreshExpiresAt: number;
}

type Fetcher = typeof fetch;

interface TokenReply {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

function tokenFrom(reply: TokenReply, now: number): StoreToken {
  if (!reply.access_token) throw new Error(reply.error_description || reply.error || "Shopify gave no access token.");
  return {
    accessToken: reply.access_token,
    scope: reply.scope ?? "",
    expiresAt: reply.expires_in ? now + reply.expires_in * 1000 : 0,
    refreshToken: reply.refresh_token ?? "",
    refreshExpiresAt: reply.refresh_token_expires_in ? now + reply.refresh_token_expires_in * 1000 : 0,
  };
}

async function askForToken(shop: string, body: Record<string, string | number>, fetcher: Fetcher, now: number): Promise<StoreToken> {
  const res = await fetcher(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const reply = (await res.json().catch(() => ({}))) as TokenReply;
  if (!res.ok) throw new Error(reply.error_description || reply.error || `Shopify answered ${res.status} when asked for a token.`);
  return tokenFrom(reply, now);
}

/** The code Shopify sent back, traded for an expiring offline token and its refresh token. */
export function exchangeCode(app: OAuthApp, shop: string, code: string, fetcher: Fetcher = fetch, now = Date.now()): Promise<StoreToken> {
  return askForToken(shop, { client_id: app.clientId, client_secret: app.clientSecret, code, expiring: 1 }, fetcher, now);
}

/** The next access token, and the new refresh token that replaces the old one. */
export function refreshToken(app: OAuthApp, shop: string, refresh: string, fetcher: Fetcher = fetch, now = Date.now()): Promise<StoreToken> {
  return askForToken(shop, { client_id: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: refresh }, fetcher, now);
}

/** Whether a token is due for refreshing: five minutes before it lapses, so no call fails on the edge. */
export function dueForRefresh(token: Pick<StoreToken, "expiresAt" | "refreshToken">, now = Date.now()): boolean {
  return Boolean(token.refreshToken) && token.expiresAt > 0 && now >= token.expiresAt - 5 * 60_000;
}
