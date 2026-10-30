/**
 * Where a dead session goes.
 *
 * A Server Component cannot delete a cookie — Next throws if it tries — so
 * `callAct` redirects here instead of clearing the token itself. This handler is
 * the only place a stale cookie is removed, and it is a `GET`, so the redirect
 * that lands on it is a plain navigation and cannot be mistaken for a form post.
 *
 * The `?expired=1` is not decoration: it is what lets `/login` say *why* the
 * listener is looking at a login form, instead of appearing to have forgotten
 * them for no reason.
 */

import { NextResponse, type NextRequest } from "next/server";

import { TOKEN_COOKIE } from "@/lib/cookie-names";

export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("expired", "1");

  const response = NextResponse.redirect(url);
  response.cookies.delete(TOKEN_COOKIE);
  return response;
}
