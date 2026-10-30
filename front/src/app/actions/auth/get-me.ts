"use server";

/**
 * Who is signed in.
 *
 * `getMe` is the shell's only hard dependency (see `domain/user.ts`). It is
 * called once per navigation from the shell layout, not from every page: a
 * Server Component tree shares the request, but a call per screen would still be
 * a round trip per screen.
 */

import { callAct } from "@/lib/call-act";
import { parseUser, USER_GET, type CurrentUser } from "@/lib/domain/user";
import { fail, ok, type ActResult } from "@/lib/result";

export async function getMe(): Promise<ActResult<CurrentUser>> {
  const result = await callAct("user", "getMe", {
    set: {},
    get: USER_GET,
  });

  if (!result.success) {
    return result;
  }

  const user = parseUser(result.body);
  if (!user) {
    // The act succeeded but the payload is not a user. Almost always a token
    // that decodes to an id the database no longer has, which `setUser` catches
    // — so reaching here means the response shape changed.
    return fail("server", "getMe returned a payload that is not a user.");
  }

  return ok(user);
}
