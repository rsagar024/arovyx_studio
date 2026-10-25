import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Protects the hidden admin panel (spec §6):
 * - /studio        → login page (redirects to /studio/overview if already authed)
 * - /studio/*      → requires a valid session cookie
 * - /api/admin/*   → 401 JSON if unauthenticated
 *   (except /api/admin/login and /api/admin/logout, which must be
 *   reachable to establish/clear a session)
 */
const OPEN_ADMIN_ROUTES = ["/api/admin/login", "/api/admin/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (pathname === "/studio") {
    if (session) {
      return NextResponse.redirect(new URL("/studio/overview", req.url));
    }
    return NextResponse.next();
  }

  if (OPEN_ADMIN_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/studio", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/:path*", "/api/admin/:path*"],
};
