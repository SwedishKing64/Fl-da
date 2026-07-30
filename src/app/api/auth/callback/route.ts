import { NextRequest } from "next/server";
import { exchangeCode, registerFulfillmentWebhook, validShop, verifyOAuthHmac } from "@/lib/shopify";
import { saveShopToken } from "@/lib/store";

export const runtime = "nodejs";

// GET /api/auth/callback — Shopify redirects here with ?code&hmac&shop&state.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const shop = params.get("shop");
  const code = params.get("code");

  if (!validShop(shop) || !code) {
    return Response.json({ error: "Missing shop or code." }, { status: 400 });
  }
  if (!verifyOAuthHmac(params)) {
    return Response.json({ error: "HMAC validation failed." }, { status: 401 });
  }
  const stateCookie = request.cookies.get("shopify_state")?.value;
  if (!stateCookie || stateCookie !== params.get("state")) {
    return Response.json({ error: "State mismatch." }, { status: 401 });
  }

  try {
    const token = await exchangeCode(shop, code);
    saveShopToken(shop, token); // TODO: persist to a DB
    await registerFulfillmentWebhook(shop, token);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "install failed" }, { status: 502 });
  }

  // Installed — send them into the app.
  return Response.redirect(new URL("/app", request.nextUrl.origin), 302);
}
