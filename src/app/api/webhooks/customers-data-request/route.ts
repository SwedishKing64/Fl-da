import { NextRequest } from "next/server";
import { verifyWebhook } from "@/lib/shopify";

export const runtime = "nodejs";

// POST /api/webhooks/customers-data-request  (Shopify mandatory GDPR webhook)
// A store owner has been asked (by a customer) for the data you hold on them.
// Verify the HMAC, then compile and deliver that data to the store owner within
// 30 days. Afterword only stores derived feedback analysis; a production build
// would gather it here and email/export it to the shop owner.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return new Response("unauthorized", { status: 401 });
  }
  let payload: { shop_domain?: string; customer?: { email?: string } } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  // TODO: compile the customer's stored data and deliver it to the shop owner.
  console.log(`[afterword] data request for ${payload.customer?.email ?? "?"} @ ${payload.shop_domain ?? "?"}`);
  return new Response("ok", { status: 200 });
}
