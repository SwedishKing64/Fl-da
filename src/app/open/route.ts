import { NextResponse, type NextRequest } from "next/server";
import { enterOpen, openMode, safeNext } from "@/lib/catalog/open";

export const runtime = "nodejs";

/**
 * The open copy's front door: signs the person in as the owner and sends them where they were
 * going. On a copy that is not open this does nothing but show the landing page.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const next = url.searchParams.get("next");
  url.search = "";
  if (!openMode()) {
    url.pathname = "/welcome";
    return NextResponse.redirect(url, { status: 303 });
  }
  await enterOpen();
  url.pathname = safeNext(next);
  return NextResponse.redirect(url, { status: 303 });
}
