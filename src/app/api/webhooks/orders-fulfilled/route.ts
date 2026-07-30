import { NextRequest } from "next/server";
import { verifyWebhook } from "@/lib/shopify";
import { FulfilledOrder, scheduleFollowUp } from "@/lib/schedule";

export const runtime = "nodejs";

// POST /api/webhooks/orders-fulfilled — Shopify calls this when an order ships.
// We verify the HMAC over the RAW body, then schedule the follow-up email.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhook(raw, hmac)) {
    return new Response("unauthorized", { status: 401 });
  }
  const shop = request.headers.get("x-shopify-shop-domain") ?? "unknown";

  let order: FulfilledOrder;
  try {
    order = JSON.parse(raw) as FulfilledOrder;
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  // now is passed explicitly so this stays deterministic/testable.
  scheduleFollowUp(shop, order, Date.now());
  return new Response("ok", { status: 200 });
}
