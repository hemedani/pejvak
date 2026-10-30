/**
 * The route guard.
 *
 * In Next.js 16 this file is `proxy.ts`, not `middleware.ts` — the convention was
 * renamed, and `middleware.ts` is deprecated. Its job here is unchanged: turn
 * away a request that has no session cookie *before* any rendering happens, and
 * remember where the listener was going.
 *
 * ## What it deliberately does not do
 *
 * **It never redirects a non-GET request.** Server Actions are POSTs to the
 * page's own route; answering one with a 307 to `/login` produces the opaque
 * "unexpected response from the server" failure with no clue in it. Auth is
 * enforced again inside every action (plan §6.3) — a missing token there returns
 * `{ success: false }`, which the UI can draw.
 *
 * **It never redirects away from `/login`.** A cookie is not a session: it can be
 * expired, or name a deleted user. Bouncing `/login` → `/` on the presence of a
 * cookie is how a stale token produces an infinite redirect loop instead of a
 * login form.
 *
 * **It does not verify the token.** Verification is a backend round trip, and
 * doing one here would put a network call in front of every asset request. The
 * shell layout asks `getMe` and is the real gate; this is the cheap first pass.
 */

import { NextResponse, type NextRequest } from "next/server";

import { TOKEN_COOKIE } from "@/lib/cookie-names";

/** Paths that must stay reachable while signed out. */
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (request.method !== "GET") {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (request.cookies.has(TOKEN_COOKIE)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";

  // Where they were going, so signing in lands them there rather than on the
  // dashboard. Only the path and query are kept — never an absolute URL, which
  // would make this an open redirect.
  const target = `${pathname}${search}`;
  if (target !== "/") {
    url.searchParams.set("redirect", target);
  }

  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except static assets and the session route handler.
   *
   * `_next/static` and `_next/image` are excluded explicitly: without that, an
   * auth redirect would answer a request for a stylesheet with HTML, and the page
   * would render unstyled while looking, from the server's side, fine.
   */
  matcher: [
    "/((?!_next/static|_next/image|fonts|favicon.ico|api/session|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)",
  ],
};
