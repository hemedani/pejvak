/**
 * Turning a failure into a sentence.
 *
 * The backend speaks English and throws bare strings ("Your password is
 * incorrect"). The UI speaks Persian only (D10). Translating inside each screen
 * would produce three different Persian sentences for one server message, so
 * the table lives here, once.
 *
 * A message that is not in the table is **not** shown. A server string that
 * leaked into a Persian page is worse than a generic sentence: it reads as a
 * crash. The raw text is kept in `failure.message` for the log and the console.
 */

import type { ActFailure } from "./result";

/** The sentences the backend is known to throw, and what they mean. */
const KNOWN_VALIDATION: readonly { pattern: RegExp; fa: string }[] = [
  { pattern: /this user does not exist/i, fa: "کاربری با این ایمیل پیدا نشد." },
  { pattern: /your password is incorrect/i, fa: "رمز عبور نادرست است." },
  { pattern: /user not exist/i, fa: "حساب کاربری شما پیدا نشد." },
  { pattern: /already exists|duplicate key/i, fa: "این مورد از قبل وجود دارد." },
  { pattern: /password/i, fa: "رمز عبور باید بین ۸ تا ۱۰۰ نویسه باشد." },
  { pattern: /email/i, fa: "ایمیل واردشده معتبر نیست." },
  // Sentinels a Server Action throws itself, before the backend sees the
  // request. They are English and live in this table for the same reason the
  // backend's do: this is the only place a failure becomes a Persian sentence,
  // and a screen that printed a Persian string it had written itself would be
  // the second such place.
  { pattern: /playlist title is required/i, fa: "نام فهرست را بنویسید." },
  { pattern: /playlist title is too long/i, fa: "نام فهرست باید کوتاه‌تر از ۱۲۰ نویسه باشد." },
  { pattern: /playlist not found/i, fa: "این فهرست پیدا نشد." },
];

const BY_KIND: Record<Exclude<ActFailure["kind"], "validation">, string> = {
  unauthorized: "نشست شما به پایان رسیده است. دوباره وارد شوید.",
  offline: "ارتباط با سرور برقرار نشد. اتصال خود را بررسی کنید.",
  server: "سرور نتوانست درخواست را انجام دهد. کمی بعد دوباره تلاش کنید.",
  unknown: "خطای نامنتظرهای رخ داد.",
};

export function failureMessage(failure: ActFailure): string {
  if (failure.kind === "validation") {
    for (const entry of KNOWN_VALIDATION) {
      if (entry.pattern.test(failure.message)) {
        return entry.fa;
      }
    }
    return "درخواست پذیرفته نشد.";
  }

  return BY_KIND[failure.kind];
}

/** Whether retrying could plausibly help — decides if the screen offers a retry. */
export function isRetryable(failure: ActFailure): boolean {
  return failure.kind === "offline" || failure.kind === "server" || failure.kind === "unknown";
}
