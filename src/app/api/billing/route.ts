import { NextRequest } from "next/server";
import { createSubscription, hasActiveSubscription } from "@/lib/billing";
import { isConfigured, validShop } from "@/lib/shopify";
import { getShopToken } from "@/lib/store";

export const runtime = "nodejs";

// GET /api/billing?shop=example.myshopify.com — the billing gate.
// If the shop already has an active subscription, send them into the app. Otherwise
// start a subscription and bounce them to Shopify's approval page. The OAuth callback
// hands off here right after install.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const shop = request.nextUrl.searchParams.get("shop");

  // Nothing to bill against without a live, installed shop — let local/dev through.
  if (!isConfigured() || !validShop(shop)) {
    return Response.redirect(new URL("/app", origin), 302);
  }
  const token = await getShopToken(shop);
  if (!token) {
    // Not installed (or token lost) — restart OAuth.
    return Response.redirect(new URL(`/api/auth?shop=${encodeURIComponent(shop)}`, origin), 302);
  }

  try {
    if (await hasActiveSubscription(shop, token)) {
      return Response.redirect(new URL("/app", origin), 302);
    }
    const returnUrl = `${origin}/api/billing/callback?shop=${encodeURIComponent(shop)}`;
    const { confirmationUrl } = await createSubscription(shop, token, returnUrl);
    return Response.redirect(confirmationUrl, 302);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "billing failed" }, { status: 502 });
  }
}
