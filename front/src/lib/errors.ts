/**
 * Failure classification for the Lesan transport.
 *
 * Ported from `mobile/src/lib/client.ts` with one deliberate removal: the
 * `FetchError` special case. That branch exists because Expo replaces the global
 * `fetch` with a native-backed implementation that rejects with something that
 * is neither a `TypeError` nor a standard error, and mobile needed it to stop
 * every genuine network failure reporting as "unexpected". A browser `fetch`
 * rejects with a `TypeError`, so the case is dead code here — and dead code that
 * claims to handle a platform we do not run on is worse than absent.
 */

import type { ActFailure } from "./result";

/** Strings the backend throws that mean "this token is no longer usable". */
const UNAUTHORIZED_PATTERNS = [
  /user not exist/i,
  /invalid or expired token/i,
  /invalid or missing token data/i,
  /should send your token/i,
];

/**
 * Strings the backend throws when it refused the *payload* rather than the
 * caller. Kept separate from `server` because the message is safe and useful to
 * show, while a `server` failure is a bug report.
 */
const VALIDATION_PATTERNS = [
  /password is incorrect/i,
  /does not exist/i,
  /already exists/i,
  /duplicate key/i,
  /must be/i,
  /required/i,
  /invalid/i,
];

function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "msg", "error", "body"]) {
      const inner = record[key];
      if (typeof inner === "string") {
        return inner;
      }
    }
  }
  return "";
}

/** Did the request fail before a response arrived at all? */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Classifies an envelope with `success: false`.
 *
 * The order matters. A validation message that happens to contain "invalid"
 * must not be read as an auth failure, so the auth patterns — which are specific
 * sentences, not words — are tested first and the generic ones only after.
 */
export function classifyActFailure(payload: unknown): ActFailure {
  const message = textOf(payload);

  for (const pattern of UNAUTHORIZED_PATTERNS) {
    if (pattern.test(message)) {
      return { kind: "unauthorized", message, detail: payload };
    }
  }

  for (const pattern of VALIDATION_PATTERNS) {
    if (pattern.test(message)) {
      return { kind: "validation", message, detail: payload };
    }
  }

  return { kind: "server", message: message || "Act failed without a message.", detail: payload };
}

export function classifyTransportFailure(error: unknown): ActFailure {
  if (isNetworkFailure(error)) {
    return { kind: "offline", message: "The backend could not be reached.", detail: error };
  }

  if (error instanceof SyntaxError) {
    return { kind: "server", message: "The backend returned malformed JSON.", detail: error };
  }

  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
    detail: error,
  };
}
