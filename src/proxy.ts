import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/setup", "/welcome"];

/** A signed-out visitor to the front door sees the landing page; anywhere else, the login page. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.get("catalog_session")?.value) {
    const url = request.nextUrl.clone();
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
