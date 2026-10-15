import { NextResponse, type NextRequest } from "next/server";
import { vendorMode } from "@/lib/catalog/licence";
import { applyEvent, verifyWebhook } from "@/lib/catalog/stripe";

export const runtime = "nodejs";

/**
 * Stripe's word on what a shop paid for. The body is read raw, since the signature is over the
 * bytes; a signature that is not Stripe's, or is stale, changes nothing and gets a 400. Only on
 * the vendor's own deployment.
 */
export async function POST(req: NextRequest) {
  if (!vendorMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.text();
  let event;
  try {
    event = verifyWebhook(body, req.headers.get("stripe-signature"), (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim());
  } catch (err) {
    console.warn("[billing] webhook refused:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Refused" }, { status: 400 });
  }
  try {
    const outcome = await applyEvent(event);
    console.log(`[billing] ${event.type}: ${outcome}`);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // A 500 makes Stripe send it again later, which is what we want for a database hiccup.
    console.error("[billing] could not apply the event:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not apply the event" }, { status: 500 });
  }
}
