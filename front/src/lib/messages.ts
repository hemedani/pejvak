/**
 * Turning a failure into a sentence.
 *
 * The backend speaks English and throws bare strings ("Your password is
 * incorrect"). The UI speaks English too, so this is no longer a translation
 * table — but it is still the **only** place a failure becomes a sentence a
 * listener reads. Two reasons that stays true:
 *
 *   · the backend's strings are written for a developer, not for someone who
 *     just mistyped a password ("Validation failed: password" is not a sentence
 *     to show a person);
 *   · a raw string that leaked into a screen would be one of several, and the
 *     same failure would read three different ways on three screens.
 *
 * A message that is not in the table is **not** shown verbatim: it becomes a
 * generic sentence, and the raw text is kept in `failure.message` for the log and
 * the console. That is the rule that has not changed — the UI never prints a
 * string it did not choose.
 */

import type { ActFailure } from "./result";

/** The sentences the backend is known to throw, and what they mean. */
const KNOWN_VALIDATION: readonly { pattern: RegExp; text: string }[] = [
  { pattern: /this user does not exist/i, text: "No account was found for that email." },
  { pattern: /your password is incorrect/i, text: "That password is incorrect." },
  { pattern: /user not exist/i, text: "Your account could not be found." },
  { pattern: /already exists|duplicate key/i, text: "That already exists." },
  { pattern: /password/i, text: "A password must be between 8 and 100 characters." },
  { pattern: /email/i, text: "That email address is not valid." },
  // Sentinels a Server Action throws itself, before the backend sees the
  // request. They live in this table for the same reason the backend's do: this
  // is the only place a failure becomes a sentence, and a screen that wrote its
  // own would be the second such place.
  { pattern: /playlist title is required/i, text: "Give the playlist a name." },
  { pattern: /playlist title is too long/i, text: "A playlist name must be 120 characters or fewer." },
  { pattern: /playlist not found/i, text: "That playlist could not be found." },
];

const BY_KIND: Record<Exclude<ActFailure["kind"], "validation">, string> = {
  unauthorized: "Your session has ended. Please sign in again.",
  offline: "Could not reach the server. Check your connection.",
  server: "The server could not complete that request. Try again in a moment.",
  unknown: "Something unexpected went wrong.",
};

export function failureMessage(failure: ActFailure): string {
  if (failure.kind === "validation") {
    for (const entry of KNOWN_VALIDATION) {
      if (entry.pattern.test(failure.message)) {
        return entry.text;
      }
    }
    return "That request was not accepted.";
  }

  return BY_KIND[failure.kind];
}

/** Whether retrying could plausibly help — decides if the screen offers a retry. */
export function isRetryable(failure: ActFailure): boolean {
  return failure.kind === "offline" || failure.kind === "server" || failure.kind === "unknown";
}
