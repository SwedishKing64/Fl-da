import { after, NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { exchangeCode, oauthApp, returnPath, shopDomain, signedByShopify, withOutcome } from "@/lib/catalog/shopify-oauth";
import { getSettings, saveSettings } from "@/lib/catalog/settings";
import { logAudit } from "@/lib/catalog/audit";

export const runtime = "nodejs";

const STATE_COOKIE = "floda_shopify_state";

/**
 * Where Shopify sends the shop owner back. The reply must be Shopify's (its signature), must answer
 * the request this browser made (the state in its cookie), and must be for the store that was named;
 * only then is the code traded for the store's token.
 */
export async function GET(req: NextRequest) {
  const app = oauthApp();
  if (!app) return NextResponse.json({ error: "This copy of Flöda has no Shopify app set up." }, { status: 400 });
  const [state, asked, nextRaw] = (req.cookies.get(STATE_COOKIE)?.value ?? "").split(":");
  const next = returnPath(decodeURIComponent(nextRaw ?? ""));
  const back = (outcome: string) => {
    const res = NextResponse.redirect(new URL(withOutcome(next, outcome), app.appUrl));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/shopify" });
    return res;
  };
  const user = await requireApiUser("ADMIN");
  if (!user) return back("signed-out");
  const q = req.nextUrl.searchParams;
  const shop = shopDomain(q.get("shop") ?? "");
  if (!state || q.get("state") !== state || !shop || shop !== asked) return back("expired");
  if (!signedByShopify(q, app.clientSecret)) return back("unsigned");
  const code = q.get("code");
  if (!code) return back("declined");
  try {
    const token = await exchangeCode(app, shop, code);
    const current = await getSettings();
    await saveSettings({ shopify: { ...current.shopify, storeDomain: shop, accessToken: token.accessToken, connectedBy: "oauth", refreshToken: token.refreshToken, expiresAt: token.expiresAt, refreshExpiresAt: token.refreshExpiresAt, scope: token.scope } });
    await logAudit("store.connected", { userId: user.id, details: { domain: shop, by: "install link", scope: token.scope } }).catch(() => undefined);
    // The store is read as soon as it is connected: its kinds, tags and listings, after the answer.
    after(async () => {
      const { syncStore } = await import("@/lib/catalog/store-sync");
      await syncStore(user.id).catch((err) => console.warn(`[shopify-oauth] first read of ${shop}: ${err instanceof Error ? err.message : String(err)}`));
    });
    return back("connected");
  } catch (err) {
    console.error(`[shopify-oauth] ${shop}: ${err instanceof Error ? err.message : String(err)}`);
    return back("failed");
  }
}
