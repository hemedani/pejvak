/**
 * The one shape every Server Action returns.
 *
 * A Server Component must never be handed a thrown `Error` (plan §6.2.4): the
 * nearest `error.tsx` would swallow the whole page — header, navigation and all
 * — to report that one list was empty. So failures come back as data, and the
 * page draws an error *state* inside its own layout.
 *
 * The vocabulary is deliberately tiny. Four kinds cover everything the backend
 * can do to us, and each one maps to exactly one thing on screen:
 *
 * | kind           | what happened                       | what the screen does            |
 * |----------------|-------------------------------------|---------------------------------|
 * | `unauthorized` | token missing, expired, or unknown  | clear the cookie, go to /login  |
 * | `validation`   | the act refused the payload         | show the server's message       |
 * | `offline`      | the request never reached the server| banner + retry, keep the page   |
 * | `server`       | it reached it and it broke          | error state + retry             |
 */
export type FailureKind = "unauthorized" | "validation" | "offline" | "server" | "unknown";

export type ActFailure = {
  kind: FailureKind;
  /**
   * The message to *log*. Never rendered raw: the UI speaks Persian and the
   * backend speaks English, so screens translate `kind` (and, for `validation`,
   * look the message up in `lib/messages.ts`).
   */
  message: string;
  /** Whatever the backend attached — a stack, a field list, a thrown string. */
  detail?: unknown;
};

export type ActSuccess<T> = { success: true; body: T };
export type ActError = { success: false; error: ActFailure };
export type ActResult<T> = ActSuccess<T> | ActError;

export function ok<T>(body: T): ActSuccess<T> {
  return { success: true, body };
}

export function fail(kind: FailureKind, message: string, detail?: unknown): ActError {
  return { success: false, error: { kind, message, detail } };
}

/**
 * Narrows a result and rethrows the failure as a sentinel.
 *
 * Used only where a page genuinely cannot continue — the shell layout, which
 * needs the signed-in user before it can draw a sidebar. Everything else should
 * branch on `success` and render a state.
 */
export class ActFailureError extends Error {
  constructor(public readonly failure: ActFailure) {
    super(failure.message);
    this.name = "ActFailureError";
  }
}

export function unwrap<T>(result: ActResult<T>): T {
  if (result.success) {
    return result.body;
  }
  throw new ActFailureError(result.error);
}
