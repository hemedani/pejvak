/**
 * The one function every Server Action calls to reach the backend.
 *
 * Three rules, all from plan §6.2:
 *
 *   1. The token comes from the cookie, never from the caller.
 *   2. `success` is checked **before** `body` is read. A Lesan failure carries
 *      its message in `body`, so reading `body` first yields a string where the
 *      screen expects a record, and the failure surfaces as a type error three
 *      screens later instead of here.
 *   3. It returns a result. It does not throw — except for `unauthorized`, which
 *      is the one failure a page cannot render its way out of.
 */

import { redirect } from "next/navigation";

import { createAppApi } from "./api";
import { getToken } from "./auth";
import { backendUrl } from "./env";
import { classifyActFailure, classifyTransportFailure } from "./errors";
import type { BackendAct, BackendModel, ReqType } from "./lesan-client";
import { fail, ok, type ActResult } from "./result";

type Service = "main";

/**
 * `& string` is not decoration. `keyof` widens to `string | number | symbol`, and
 * the transport takes a `string`; without the intersection every call site needs a
 * cast to say what the generated declarations already know.
 */
type Model = BackendModel<Service> & string;
type Act<M extends Model> = BackendAct<Service, M> & string;

/**
 * The exact `{ set, get }` an act accepts, pulled out of the generated
 * `ReqType` rather than restated. A projection that the validator does not
 * allow is a compile error here, which is the whole reason the declarations are
 * vendored.
 */
export type ActDetails<M extends Model, A extends Act<M>> = {
  set: ReqType[Service][M][A] extends { set: infer S } ? S : never;
  get: ReqType[Service][M][A] extends { get?: infer G } ? G : never;
};

export type CallOptions = {
  /** Skips the cookie read. Only `login` and `register` have no token yet. */
  anonymous?: boolean;
};

export async function callAct<M extends Model, A extends Act<M>>(
  model: M,
  act: A,
  details: ActDetails<M, A>,
  options: CallOptions = {},
): Promise<ActResult<unknown>> {
  const token = options.anonymous ? null : await getToken();

  if (!token && !options.anonymous) {
    // No cookie at all. There is nothing to retry and nothing to show: the
    // listener is signed out, and the middleware will have caught a navigation
    // long before this. A Server Action reaching here means the tab sat idle
    // until the cookie expired.
    return fail("unauthorized", "No session token.");
  }

  const api = createAppApi(backendUrl(), token);

  let envelope;
  try {
    envelope = await api.send({
      model,
      act,
      details: details as { set: unknown; get: unknown },
    });
  } catch (error) {
    return { success: false, error: classifyTransportFailure(error) };
  }

  if (envelope.success) {
    return ok(envelope.body);
  }

  const failure = classifyActFailure(envelope.body ?? envelope.message ?? envelope.error);

  if (failure.kind === "unauthorized") {
    // The cookie exists but the token is dead. Deleting a cookie is not allowed
    // during a Server Component render, so the redirect target is a route
    // handler that clears it and then lands on /login (plan §6.3). Without this
    // the listener would bounce between a shell that cannot load and a login
    // page that sees a cookie and sends them back.
    redirect("/api/session/expired");
  }

  return { success: false, error: failure };
}
