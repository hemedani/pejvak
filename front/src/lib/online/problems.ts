/**
 * What a source's failure says to the listener.
 *
 * A third-party failure has two audiences. The listener needs one Persian
 * sentence that tells them what happened and whether trying again is worth it;
 * the developer needs the source's own error, which belongs in a `<details>` and
 * in the log, never in the heading.
 *
 * The copy lives here rather than in `SourceProblem` because the *play* control
 * needs the same sentences and runs on the client: tapping play on a collection
 * whose source is down must say the same thing as opening that source's page.
 * Two copies of five sentences would drift the first time one of them is
 * rewritten.
 *
 * The code is carried across the wire in `ActFailure.detail.code` (see
 * `errors.ts`), so nothing here parses an English message.
 */

import { onlineErrorCode } from "@/lib/online/errors";
import type { ActFailure } from "@/lib/result";

/**
 * Every reason a source can fail to answer, plus the one the adapter cannot
 * know: a source that is registered but not reachable at all.
 */
export type OnlineProblemCode = "offline" | "timeout" | "not_found" | "invalid_response" | "unavailable";

const COPY: Record<OnlineProblemCode, string> = {
  offline: "به منبع وصل نشدیم. اتصال خود را بررسی کنید.",
  timeout: "منبع دیر جواب داد. دوباره تلاش کنید.",
  invalid_response: "پاسخ منبع خوانا نبود. شاید ساختارش عوض شده است.",
  not_found: "این مجموعه در منبع پیدا نشد.",
  unavailable: "این منبع فعلاً در دسترس نیست.",
};

export function onlineProblemMessage(code: OnlineProblemCode): string {
  return COPY[code];
}

/**
 * The source-side reason behind a failed read, as a code.
 *
 * `detail.code` wins when the adapter set one — it is the only way to tell a
 * timeout from a dropped connection, and both arrive as `kind: "offline"`.
 * Without it the failure kind is still enough to choose an honest sentence:
 * an unreachable backend is `offline`, and a refusal is `not_found` because the
 * id in the URL is the thing that was wrong.
 */
export function problemCodeFor(failure: ActFailure): OnlineProblemCode {
  const code = onlineErrorCode(failure.detail);
  if (code !== null) {
    return code;
  }
  switch (failure.kind) {
    case "offline":
      return "offline";
    case "validation":
      return "not_found";
    default:
      return "unavailable";
  }
}
