import { NextRequest } from "next/server";
import { hasActiveSubscription } from "@/lib/billing";
import { validShop } from "@/lib/shopify";
import { getShopToken } from "@/lib/store";

export const runtime = "nodejs";

// GET /api/billing/callback?shop=...&charge_id=... — Shopify sends the merchant here
// after they approve (or decline) the subscription. We re-check the shop's active
// subscriptions: approved → into the app; declined → back to the billing gate to retry.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const shop = request.nextUrl.searchParams.get("shop");
  if (!validShop(shop)) {
    return Response.json({ error: "Missing shop." }, { status: 400 });
  }
  const token = await getShopToken(shop);
  if (!token) {
    return Response.redirect(new URL(`/api/auth?shop=${encodeURIComponent(shop)}`, origin), 302);
  }

  try {
    if (await hasActiveSubscription(shop, token)) {
      return Response.redirect(new URL("/app", origin), 302);
    }
  } catch {
    // fall through to a retry
  }
  // Not active (declined, or not yet propagated) — send them back through the gate.
  return Response.redirect(new URL(`/api/billing?shop=${encodeURIComponent(shop)}`, origin), 302);
}
