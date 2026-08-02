import { NextRequest } from "next/server";
import { verifyWebhook } from "@/lib/shopify";
import { purgeShop } from "@/lib/schedule";
import { deleteShopToken } from "@/lib/store";

export const runtime = "nodejs";

// POST /api/webhooks/shop-redact  (Shopify mandatory GDPR webhook)
// Fires ~48 hours after a shop uninstalls the app. Verify the HMAC, then erase
// everything you hold for that shop: its access token and any queued follow-ups
// (a production build would drop all of the shop's rows from the DB).
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return new Response("unauthorized", { status: 401 });
  }
  let payload: { shop_domain?: string } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  const shop = payload.shop_domain;
  if (shop) {
    await deleteShopToken(shop);
    const removed = await purgeShop(shop);
    console.log(`[afterword] redacted shop ${shop} (token cleared, ${removed} follow-ups purged)`);
  }
  return new Response("ok", { status: 200 });
}
