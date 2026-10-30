/**
 * Cookie names, in a module with no server imports.
 *
 * `lib/auth.ts` reads cookies through `next/headers`, which cannot be imported
 * into `proxy.ts` (it runs before the render). The *name* is needed in both
 * places, so it lives here — one string, two readers, and no chance of the guard
 * looking for `token` while the login action writes `Token`.
 */

export const TOKEN_COOKIE = "token";
export const THEME_COOKIE = "theme";

/** Where an expired session is sent: a route handler that clears the cookie. */
export const SESSION_EXPIRED_PATH = "/api/session/expired";
