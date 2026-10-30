/**
 * Time, ported from `mobile/src/lib/time.ts`.
 *
 * `formatClock`, `digitsToSeconds` and `clampSeconds` are copied verbatim and
 * keep their tests — they are the same arithmetic the phone uses, and two
 * implementations of "how long is this" would disagree at the boundary.
 *
 * `formatRelativeTime` is **not** verbatim, and the difference is a decision
 * rather than an oversight: the mobile version returns English ("3 hr ago")
 * because the phone's UI was English when it was written. Here the UI is
 * Persian only (D10), and hand-translating "1 min ago"/"2 min ago" would mean
 * hand-writing Persian plurals. `Intl.RelativeTimeFormat("fa")` already knows
 * them, so the words come from ICU and only the *thresholds* are ported.
 */

/** Formats integer seconds as `m:ss`, or `h:mm:ss` once past an hour. */
export function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) ? totalSec : 0;
  const seconds = Math.max(0, Math.floor(safe));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago something happened, in the words a person would use.
 *
 * `now` is a parameter rather than a `Date.now()` read so the function stays
 * pure and testable, and so a list of rows cannot get two different answers for
 * the same instant. (Ported reasoning, unchanged.)
 *
 * Anything older than a week falls back to a date, because "۲۳ روز پیش" is less
 * useful than the day itself once the distance stops being the point.
 */
export function formatRelativeTime(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return "هرگز";
  }

  const elapsed = now - timestamp;

  // A clock that is behind, or an event recorded in the future, is not
  // "negative time ago" — it is almost always a device clock change.
  if (elapsed < 0 || elapsed < 45_000) {
    return "همین حالا";
  }

  const relative = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });

  const minutes = Math.floor(elapsed / MINUTE);
  if (minutes < 60) {
    return relative.format(-minutes, "minute");
  }

  const hours = Math.floor(elapsed / HOUR);
  if (hours < 24) {
    return relative.format(-hours, "hour");
  }

  const days = Math.floor(elapsed / DAY);
  if (days < 7) {
    return relative.format(-days, "day");
  }

  return formatDate(timestamp);
}

/**
 * A calendar date in the Jalali calendar.
 *
 * `fa-IR` resolves to the Persian calendar through ICU (D7) — no date library,
 * and no hand-rolled conversion table to get wrong around a leap year.
 */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
}

/** A date and a clock time, for a session's start. */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/** The short day label above a history group: `۱۴ مهر`. */
export function formatDayHeading(timestamp: number): string {
  return new Intl.DateTimeFormat("fa-IR", { month: "long", day: "numeric" }).format(
    new Date(timestamp),
  );
}

/**
 * Reads a run of digits from the right: the last two are seconds, the next two
 * minutes, and the rest hours. `"1234"` is 12:34, not 1,234 seconds.
 *
 * A timecode is typed the way it is read — right to left, smallest unit first —
 * so a jump-to-time field can accept `"90"`, `"1234"` and `"123456"` without a
 * separator being typed at all. Anything that is not a digit is ignored, which
 * lets someone paste `"12:34"` and get the time they meant.
 *
 * Persian digits are mapped first: a listener typing on a Persian keyboard
 * produces `۱۲۳۴`, and `\D` would strip every one of them.
 */
export function digitsToSeconds(digits: string): number {
  const clean = toAsciiDigits(digits)
    .replace(/\D/g, "")
    .slice(-6);
  if (clean.length === 0) {
    return 0;
  }
  const seconds = Number(clean.slice(-2));
  const minutes = Number(clean.slice(-4, -2) || 0);
  const hours = Number(clean.slice(0, -4) || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Clamps a time to `[0, maxSec]` and to a whole second. `undefined` means no upper bound. */
export function clampSeconds(value: number, maxSec?: number): number {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return maxSec === undefined ? safe : Math.min(safe, Math.max(0, Math.floor(maxSec)));
}

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;
const ARABIC_INDIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

/** `۱۲۳` and `١٢٣` → `123`. */
export function toAsciiDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const persian = PERSIAN_DIGITS.indexOf(char as (typeof PERSIAN_DIGITS)[number]);
    if (persian !== -1) {
      out += String(persian);
      continue;
    }
    const arabic = ARABIC_INDIC_DIGITS.indexOf(char as (typeof ARABIC_INDIC_DIGITS)[number]);
    out += arabic !== -1 ? String(arabic) : char;
  }
  return out;
}

/**
 * Midnight of the day a timestamp falls in, in the *browser's* zone.
 *
 * Day buckets are built by comparing these numbers, not by formatting a date
 * and grouping on the string: a formatting-based group would put two different
 * days in one bucket whenever the locale's calendar and the machine's zone
 * disagree, and the chart would silently lose a day.
 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
