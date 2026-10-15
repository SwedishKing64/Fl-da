import { NextResponse, type NextRequest } from "next/server";
import { enterDemo } from "@/lib/catalog/demo";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The demo's front door. A good token signs the visitor in and sends them to the demo order's
 * review grid; a bad one goes to the landing page, which says nothing about why.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/demo/[token]">) {
  const { token } = await ctx.params;
  const entered = await enterDemo(token, req.nextUrl.origin);
  const url = req.nextUrl.clone();
  url.search = "";
  url.pathname = !entered ? "/welcome" : entered.batchId ? `/batches/${entered.batchId}/review` : "/";
  return NextResponse.redirect(url, { status: 303 });
}
