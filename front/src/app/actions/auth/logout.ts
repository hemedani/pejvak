"use server";

/**
 * Sign out.
 *
 * Deleting the cookie is the whole operation: the backend's JWT is stateless and
 * there is no revocation act (plan §2 C3), so the token stays valid until it
 * expires. What makes signing out *stick* is that the browser no longer has it —
 * which is why the redirect happens here, server-side, rather than in the client
 * after the call returns. A client-side redirect can be undone with "back"; a
 * server redirect from a POST cannot, because the page it would return to is
 * behind a guard that now fails.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { TOKEN_COOKIE } from "@/lib/auth";

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  redirect("/login");
}
