/**
 * The five sentences a failed source read can produce, and how a failure picks
 * one.
 *
 * The case worth pinning is the one the code exists for: `timeout` and
 * `offline` both arrive as `kind: "offline"`, so only `detail.code` can tell
 * them apart — and a listener who reads "check your connection" while their
 * connection is fine has been told something false.
 */

import { describe, expect, it } from "vitest";

import { onlineProblemMessage, problemCodeFor } from "@/lib/online/problems";
import type { ActFailure, FailureKind } from "@/lib/result";

/** A failure the way an action returns one, without wrapping it in a result. */
function failure(kind: FailureKind, message: string, detail?: unknown): ActFailure {
  return { kind, message, detail };
}

describe("problemCodeFor", () => {
  it("prefers the source's own code over the failure kind", () => {
    expect(problemCodeFor(failure("offline", "took too long", { code: "timeout" }))).toBe("timeout");
    expect(problemCodeFor(failure("server", "bad html", { code: "invalid_response" }))).toBe(
      "invalid_response",
    );
    expect(problemCodeFor(failure("validation", "gone", { code: "not_found" }))).toBe("not_found");
  });

  it("falls back to the kind when the detail carries nothing usable", () => {
    expect(problemCodeFor(failure("offline", "no connection"))).toBe("offline");
    expect(problemCodeFor(failure("validation", "refused"))).toBe("not_found");
    expect(problemCodeFor(failure("server", "boom"))).toBe("unavailable");
    expect(problemCodeFor(failure("unknown", "?"))).toBe("unavailable");
  });

  it("ignores a detail that is not a code", () => {
    expect(problemCodeFor(failure("server", "boom", { code: "something-else" }))).toBe("unavailable");
    expect(problemCodeFor(failure("offline", "boom", "a string"))).toBe("offline");
  });
});

describe("onlineProblemMessage", () => {
  it("answers every code with a sentence, never with an empty string", () => {
    for (const code of ["offline", "timeout", "not_found", "invalid_response", "unavailable"] as const) {
      const message = onlineProblemMessage(code);
      expect(message.length).toBeGreaterThan(0);
      // A sentence for the listener, not the source's own error text.
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("keeps timeout and offline apart", () => {
    // Both arrive as `kind: "offline"`, so identical copy would tell a listener
    // with a working connection to check it.
    expect(onlineProblemMessage("timeout")).not.toBe(onlineProblemMessage("offline"));
  });
});
