/**
 * The session cookie.
 *
 * The JWT lives in an `httpOnly` cookie named exactly `token` — the same name
 * the backend reads from the request header (D5, plan §2 C5). Nothing in the
 * browser can read it, which is the point: a token in `localStorage` is a token
 * any injected script can exfiltrate.
 */

import { cookies } from "next/headers";

import { TOKEN_COOKIE } from "./cookie-names";

export { TOKEN_COOKIE };

/** Seven days, matching the backend's own token lifetime. */
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

/**
 * The token for the current request, or `null`.
 *
 * Read on the server only. A Server Action that finds `null` returns
 * `{ success: false }` rather than throwing (plan §6.3) — a signed-out user
 * pressing a button is an ordinary event, not an exception.
 */
export async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value ?? null;
}

/**
 * `sameSite: "lax"` is required, not a default.
 *
 * `strict` would drop the cookie on the redirect back from any external link,
 * signing the listener out every time they follow one. `lax` sends it on
 * top-level navigations and with same-origin `fetch`/form posts, which is
 * exactly the traffic this app generates.
 */
export function tokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}
