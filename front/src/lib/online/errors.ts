/**
 * Turning a source's failure into the app's failure vocabulary.
 *
 * `OnlineSourceError` already knows *why* a source could not answer; the server
 * action's job is to carry that across the wire without losing it. The mapping
 * is deliberately blunt:
 *
 *   · `offline` / `timeout` → `offline` — the screen keeps what it has and
 *     offers a retry.
 *   · `not_found` → `validation` — the id in the URL is not one the source has;
 *     there is nothing to retry.
 *   · `invalid_response` → `server` — the source broke its own contract.
 *
 * The original code is kept in `detail.code` so a screen can say "timed out"
 * rather than the generic server sentence, without the UI layer importing the
 * adapter's error class.
 */

import { fail, type ActError } from "@/lib/result";
import { OnlineSourceError, type OnlineErrorCode } from "@/lib/online/types";

/** The source-side reason behind a failure, when there was one. */
export function onlineErrorCode(detail: unknown): OnlineErrorCode | null {
  if (typeof detail !== "object" || detail === null) {
    return null;
  }
  const code = (detail as { code?: unknown }).code;
  return code === "offline" ||
    code === "timeout" ||
    code === "not_found" ||
    code === "invalid_response"
    ? code
    : null;
}

export function toOnlineFailure(error: unknown): ActError {
  if (error instanceof OnlineSourceError) {
    switch (error.code) {
      case "not_found":
        return fail("validation", error.message, { code: error.code });
      case "offline":
      case "timeout":
        return fail("offline", error.message, { code: error.code });
      case "invalid_response":
        return fail("server", error.message, { code: error.code });
    }
  }

  return fail(
    "server",
    error instanceof Error ? error.message : "The source failed unexpectedly.",
    { code: "invalid_response" },
  );
}
