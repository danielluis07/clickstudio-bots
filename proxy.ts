import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { returnToParam, signInPath } from "@/server/auth/redirects";

/**
 * Cheap cookie presence check so signed-out visitors are redirected before a
 * render is wasted. This is NOT authorization: it never validates the session,
 * the platform role or Tenant membership. Every protected page and Server
 * Action still calls a guard from `@/server/auth/guards`. See ADR 0004.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signInUrl = new URL(signInPath, request.url);
  signInUrl.searchParams.set(returnToParam, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/painel/:path*"],
};
