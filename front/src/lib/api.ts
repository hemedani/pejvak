/**
 * The backend client, bound to one URL and one token.
 *
 * Server-only. Nothing here is reachable from a browser bundle: the token lives
 * in an `httpOnly` cookie (D5) and every call is made from a Server Action or a
 * Server Component. There is deliberately no `NEXT_PUBLIC_` variant of this
 * module, because a client-side copy would be a second, unauthenticated path to
 * the backend that D4 exists to prevent.
 */

import { lesanApi } from "./lesan-client";

/** The envelope Lesan wraps every response in (plan §2 C5). */
export type LesanEnvelope = {
  success?: boolean;
  body?: unknown;
  message?: string;
  error?: unknown;
};

export type AppApi = {
  /** Sends one act and returns the *raw* parsed envelope. Never throws. */
  send: (request: {
    model: string;
    act: string;
    details: { set: unknown; get: unknown };
  }) => Promise<LesanEnvelope>;
};

/**
 * `createAppApi(url, token)` — the plan calls this `AppApi(url, token)`.
 *
 * A factory rather than a module-level singleton, because a singleton would need
 * the token at import time and a token is per-request. Two concurrent requests
 * for two users must not share one.
 */
export function createAppApi(url: string, token: string | null): AppApi {
  const transport = lesanApi({
    URL: url,
    settings: {
      // A hung backend must not hold a Server Component render open until the
      // platform gives up. Ten seconds is longer than any act here needs and
      // short enough that the error state arrives while the user is still there.
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
    baseHeaders: {
      Accept: "application/json",
      // No `Bearer` prefix — Lesan reads the raw header (plan §2 C5).
      ...(token ? { token } : {}),
    },
  });

  return {
    send: async (request) => {
      const body = request as unknown as Parameters<typeof transport.send>[0];
      const payload: unknown = await transport.send(body);
      return normalizeEnvelope(payload);
    },
  };
}

/**
 * Guarantees an object with a boolean `success`.
 *
 * `lesanApi` returns `req.json()`, whose type is `any` — an untyped hole in the
 * middle of a strictly typed app. This is the single place it is closed. A body
 * that is not an object at all (an HTML error page from a proxy, an empty 204)
 * becomes `{ success: false }` with the raw text attached, so the failure is
 * reported as "the backend answered something unexpected" rather than as a
 * `TypeError` two frames later.
 */
export function normalizeEnvelope(payload: unknown): LesanEnvelope {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return {
      success: record.success === true,
      body: record.body,
      message: typeof record.message === "string" ? record.message : undefined,
      error: record.error,
    };
  }

  return { success: false, body: payload, message: "The backend returned a non-object response." };
}
