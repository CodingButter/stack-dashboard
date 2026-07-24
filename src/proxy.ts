import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "stackdash_session";

/**
 * Optimistic auth gate (Next 16 proxy — the middleware successor): requests
 * without a session cookie are bounced to /login. Real session validation
 * (DB lookup, expiry, disabled users) happens in the data layer via
 * getSession(); this only keeps anonymous traffic out of the app shell.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
