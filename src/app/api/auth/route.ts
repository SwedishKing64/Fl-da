import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { authUrl, isConfigured, validShop } from "@/lib/shopify";

export const runtime = "nodejs";

// GET /api/auth?shop=example.myshopify.com — start the OAuth install.
export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return Response.json({ error: "Set SHOPIFY_API_KEY / SHOPIFY_API_SECRET / SHOPIFY_APP_URL to enable install." }, { status: 501 });
  }
  const shop = request.nextUrl.searchParams.get("shop");
  if (!validShop(shop)) {
    return Response.json({ error: "Pass a valid ?shop=your-store.myshopify.com" }, { status: 400 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const res = Response.redirect(authUrl(shop, state), 302);
  // state should be validated on callback — store it in a cookie.
  res.headers.append("Set-Cookie", `shopify_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
  return res;
}
