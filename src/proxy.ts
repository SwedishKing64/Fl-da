import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/catalog/login", "/catalog/setup"];

/** Redirect signed-out visitors of the catalog tool to the login page. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.get("catalog_session")?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/catalog/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/catalog/:path*"],
};
