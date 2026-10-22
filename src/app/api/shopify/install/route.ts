import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { authorizeUrl, newState, oauthApp, returnPath, shopDomain, withOutcome } from "@/lib/catalog/shopify-oauth";

export const runtime = "nodejs";

/** The cookie that ties Shopify's reply to the person who asked; read back by the callback. */
const STATE_COOKIE = "floda_shopify_state";

/**
 * The install link: an admin names their store, and is sent to its own admin to approve Flöda.
 * Shopify sends them back to the callback with a code.
 */
export async function GET(req: NextRequest) {
  if (!(await requireApiUser("ADMIN"))) return NextResponse.json({ error: "Only an admin can connect the store." }, { status: 401 });
  const app = oauthApp();
  if (!app) return NextResponse.json({ error: "This copy of Flöda has no Shopify app set up (SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, FLODA_APP_URL). Paste an Admin API token instead." }, { status: 400 });
  const next = returnPath(req.nextUrl.searchParams.get("next"));
  const shop = shopDomain(req.nextUrl.searchParams.get("shop") ?? "");
  if (!shop) return NextResponse.redirect(new URL(withOutcome(next, "bad-shop"), app.appUrl));
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(app, shop, state));
  res.cookies.set(STATE_COOKIE, `${state}:${shop}:${encodeURIComponent(next)}`, { httpOnly: true, secure: app.appUrl.startsWith("https://"), sameSite: "lax", path: "/api/shopify", maxAge: 600 });
  return res;
}
