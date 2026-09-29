/**
 * The one way an adapter talks to a source.
 *
 * Every source is a stranger's server reached over a phone's connection, so the
 * same three things have to be true of every request: it must stop when the
 * screen that asked for it goes away, it must fail in bounded time even when the
 * server accepts the connection and then says nothing, and it must fail with a
 * *typed* error so a screen can branch on the reason instead of on a message.
 *
 * This lives apart from any one adapter because it is the only part of the work
 * that is identical for all of them: a second source should bring its own
 * mapping rules and nothing else.
 */

import { OnlineSourceError } from "@/lib/online/types";

/** Long enough for a slow catalogue page, short enough to not feel hung. */
export const DEFAULT_TIMEOUT_MS = 20_000;

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && /abort/i.test(error.name + error.message);
}

/**
 * Fetch and parse JSON, turning every failure into an `OnlineSourceError`.
 *
 * The caller's `signal` and our own timeout are merged so a screen that
 * unmounts mid-request stops the work, while a server that accepts the
 * connection and then says nothing still fails in bounded time. Distinguishing
 * timeout from a user cancel matters: only one of them is worth retrying.
 */
export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new OnlineSourceError(
        response.status === 404
          ? "That collection is no longer on the source."
          : `The source answered with ${response.status}.`,
        response.status === 404 ? "not_found" : "invalid_response",
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof OnlineSourceError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new OnlineSourceError(
        timedOut ? "The source took too long to answer." : "Request cancelled.",
        timedOut ? "timeout" : "offline",
      );
    }
    if (error instanceof SyntaxError) {
      throw new OnlineSourceError("The source sent something unreadable.", "invalid_response");
    }
    throw new OnlineSourceError("Could not reach the source.", "offline");
  } finally {
    clearTimeout(timer);
  }
}
