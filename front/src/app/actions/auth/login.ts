"use server";

/**
 * Sign in, and put the token where the browser cannot read it.
 *
 * The action is the only place a token is ever written (D5). The client sends an
 * email and a password; the token comes back in the response body and never
 * crosses to the client — it is written to an `httpOnly` cookie inside this
 * function and the client is told nothing but "yes".
 */

import { cookies } from "next/headers";

import { TOKEN_COOKIE, tokenCookieOptions } from "@/lib/auth";
import { callAct } from "@/lib/call-act";
import { asRecord, asString } from "@/lib/parse";
import { fail, ok, type ActResult } from "@/lib/result";

export type LoginInput = { email: string; password: string };

export type LoginResult = { displayName: string | null };

export async function login(input: LoginInput): Promise<ActResult<LoginResult>> {
  const result = await callAct(
    "user",
    "login",
    {
      set: { email: input.email.trim().toLowerCase(), password: input.password },
      // The projection asks for the token and the four fields the shell renders.
      // Asking for `user` alone would return the whole document, password hash
      // included — the act strips it, but the fewer fields requested the smaller
      // the surface for that to go wrong.
      get: {
        token: 1,
        user: { _id: 1, username: 1, email: 1, displayName: 1, avatarUrl: 1 },
      },
    },
    { anonymous: true },
  );

  if (!result.success) {
    return result;
  }

  const body = asRecord(result.body);
  const token = body ? asString(body.token) : null;

  if (!token) {
    // A success envelope with no token is not a login. Reporting it as a server
    // failure keeps the client from navigating into a shell that has no session.
    return fail("server", "The login act succeeded without returning a token.");
  }

  const store = await cookies();
  store.set(TOKEN_COOKIE, token, tokenCookieOptions());

  return ok({ displayName: body ? asString(asRecord(body.user)?.displayName) : null });
}
