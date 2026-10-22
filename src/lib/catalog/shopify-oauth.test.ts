import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { authorizeUrl, dueForRefresh, exchangeCode, oauthApp, refreshToken, shopDomain, signedByShopify } from "./shopify-oauth";

const app = { clientId: "client-abc", clientSecret: "shh-secret", appUrl: "https://fl-da.vercel.app" };

describe("connecting a store through the install link", () => {
  it("takes only a store's own myshopify address", () => {
    expect(shopDomain("ridgeway-outdoor")).toBe("ridgeway-outdoor.myshopify.com");
    expect(shopDomain("https://Ridgeway-Outdoor.myshopify.com/admin")).toBe("ridgeway-outdoor.myshopify.com");
    expect(shopDomain("ridgeway.com")).toBeNull();
    expect(shopDomain("evil.example/x.myshopify.com")).toBeNull();
  });

  it("is set up only where the app's client ID, secret and address are all given", () => {
    expect(oauthApp({ SHOPIFY_CLIENT_ID: "a", SHOPIFY_CLIENT_SECRET: "b", FLODA_APP_URL: "https://x.app/" })).toEqual({ clientId: "a", clientSecret: "b", appUrl: "https://x.app" });
    expect(oauthApp({ SHOPIFY_CLIENT_ID: "a", SHOPIFY_CLIENT_SECRET: "b", VERCEL_PROJECT_PRODUCTION_URL: "fl-da.vercel.app" })?.appUrl).toBe("https://fl-da.vercel.app");
    expect(oauthApp({ SHOPIFY_CLIENT_ID: "a" })).toBeNull();
  });

  it("sends the owner to their own admin with Flöda's scopes and the way back", () => {
    const url = new URL(authorizeUrl(app, "ridgeway-outdoor.myshopify.com", "st4te"));
    expect(url.origin).toBe("https://ridgeway-outdoor.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://fl-da.vercel.app/api/shopify/callback");
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("scope")).toContain("write_products");
  });

  it("trusts a reply only with Shopify's signature on it", () => {
    const params = { code: "c0de", shop: "ridgeway-outdoor.myshopify.com", state: "st4te", timestamp: "1761200000" };
    const message = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    const hmac = createHmac("sha256", app.clientSecret).update(message).digest("hex");
    expect(signedByShopify(new URLSearchParams({ ...params, hmac }), app.clientSecret)).toBe(true);
    expect(signedByShopify(new URLSearchParams({ ...params, code: "other", hmac }), app.clientSecret)).toBe(false);
    expect(signedByShopify(new URLSearchParams({ ...params, hmac }), "another-secret")).toBe(false);
    expect(signedByShopify(new URLSearchParams(params), app.clientSecret)).toBe(false);
  });

  it("trades the code for an expiring token and its refresh token, and refreshes before it lapses", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ access_token: "shpat_1", scope: "read_products", expires_in: 3600, refresh_token: "shprt_1", refresh_token_expires_in: 7776000 }), { status: 200 });
    }) as unknown as typeof fetch;
    const token = await exchangeCode(app, "ridgeway-outdoor.myshopify.com", "c0de", fetcher, 1_000_000);
    expect(sent[0]).toMatchObject({ client_id: "client-abc", code: "c0de", expiring: 1 });
    expect(token).toMatchObject({ accessToken: "shpat_1", refreshToken: "shprt_1", expiresAt: 1_000_000 + 3_600_000 });
    expect(dueForRefresh(token, 1_000_000)).toBe(false);
    expect(dueForRefresh(token, token.expiresAt - 60_000)).toBe(true);
    expect(dueForRefresh({ expiresAt: 0, refreshToken: "" }, Date.now())).toBe(false);
    await refreshToken(app, "ridgeway-outdoor.myshopify.com", "shprt_1", fetcher);
    expect(sent[1]).toMatchObject({ grant_type: "refresh_token", refresh_token: "shprt_1" });
  });

  it("says what Shopify said when it refuses", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ error: "invalid_request", error_description: "The authorization code was not found or was already used" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode(app, "ridgeway-outdoor.myshopify.com", "old", fetcher)).rejects.toThrow(/already used/);
  });
});
