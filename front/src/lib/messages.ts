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

  /*
   * Admin refusals. They are already specific English sentences written for an
   * operator; the table exists so the panel never prints a string it did not
   * choose, not to paraphrase away the one detail that explains the refusal.
   */
  { pattern: /requires an admin account/i, text: "This action requires an admin account." },
  { pattern: /user not found/i, text: "That account could not be found." },
  { pattern: /you cannot change your own role/i, text: "You cannot change your own role." },
  { pattern: /you cannot change the status of your own account/i, text: "You cannot change the status of your own account." },
  { pattern: /you cannot delete your own account/i, text: "You cannot delete your own account." },
  { pattern: /at least one active admin/i, text: "There must be at least one active admin." },
  { pattern: /another account already uses that email/i, text: "Another account already uses that email." },
  { pattern: /type the account's email address/i, text: "Type the account's email address to confirm the deletion." },
  { pattern: /could not be deleted/i, text: "The account could not be deleted. Refresh and try again." },
  { pattern: /no active subscription/i, text: "This account has no active subscription to revoke." },
  { pattern: /active subscriber/i, text: "This plan still has active subscribers. Move or revoke them before archiving it." },
  { pattern: /a usage grant needs at least one cap/i, text: "A usage grant needs at least one cap." },
  { pattern: /a usage grant does not take a duration/i, text: "A usage grant does not take a duration." },
  { pattern: /caps\..*positive whole number/i, text: "Every usage cap must be zero or a positive whole number." },
  { pattern: /a duration grant needs a duration/i, text: "A duration grant needs a duration." },
  { pattern: /duration\.value must be a positive whole number/i, text: "The duration must be a positive whole number." },
  { pattern: /a duration grant does not take caps/i, text: "A duration grant does not take caps." },
  { pattern: /a forever grant does not take/i, text: "A forever grant does not take a duration or caps." },
  { pattern: /choose a grant mode/i, text: "Choose forever, duration or usage for this grant." },
  { pattern: /that plan does not exist/i, text: "That plan does not exist." },
  { pattern: /that plan is no longer available/i, text: "That plan is no longer available." },
  { pattern: /credits must be a positive whole number/i, text: "Credits must be a positive whole number." },
  { pattern: /transaction not found/i, text: "That transaction could not be found." },
  { pattern: /only a paid transaction can be refunded/i, text: "Only a paid transaction can be refunded." },
  { pattern: /this payment was refunded/i, text: "This payment was already refunded." },
  { pattern: /this payment was canceled/i, text: "This payment was canceled and cannot be completed." },
  { pattern: /a new plan needs a title/i, text: "A new plan needs a title." },
  { pattern: /priceCents cannot be negative/i, text: "The price cannot be negative." },
  { pattern: /mark another plan as the default/i, text: "Mark another plan as the default before unsetting this one." },
  { pattern: /must be -1 .* unlimited/i, text: "A limit must be -1 (unlimited) or zero and above." },
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
