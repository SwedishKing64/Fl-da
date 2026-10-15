import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/setup", "/welcome", "/about", "/faq", "/privacy", "/download", "/demo", "/open"];

/**
 * A signed-out visitor to the front door sees the landing page; anywhere else, the login page.
 * On an open copy (a desktop build with no sign-in, FLODA_OPEN=1) there is no login page: the
 * visitor is sent through `/open`, which signs them in as the owner and brings them back.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.get("catalog_session")?.value) {
    const url = request.nextUrl.clone();
    if (process.env.FLODA_OPEN === "1") { url.pathname = "/open"; url.search = ""; url.searchParams.set("next", pathname); return NextResponse.redirect(url); }
    if (pathname === "/") { url.pathname = "/welcome"; url.search = ""; return NextResponse.redirect(url); }
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they check auth themselves), Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
