import { NextRequest } from "next/server";
import { verifyWebhook } from "@/lib/shopify";
import { purgeEmail } from "@/lib/schedule";

export const runtime = "nodejs";

// POST /api/webhooks/customers-redact  (Shopify mandatory GDPR webhook)
// A customer asked the store to erase their data. Verify the HMAC, then delete
// everything you hold on that customer. We drop any queued follow-ups for them
// (and a production build would delete their stored feedback rows).
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
  const email = payload.customer?.email;
  const removed = email ? purgeEmail(email) : 0;
  // TODO: also delete this customer's stored feedback/analysis from the DB.
  console.log(`[afterword] redacted customer ${email ?? "?"} (${removed} follow-ups purged)`);
  return new Response("ok", { status: 200 });
}
