/**
 * Time, ported from `mobile/src/lib/time.ts`.
 *
 * The web app speaks English, so this file now matches the phone rather than
 * diverging from it: `formatRelativeTime` returns the same words the phone does
 * ("3 hr ago", "Just now", "Never"), and dates are Gregorian. Keeping the two
 * apps' wording identical is the point — a listener who installs both should not
 * see one screen say "3 hr ago" and the other say something else for the same
 * event.
 *
 * `formatClock`, `digitsToSeconds` and `clampSeconds` are copied verbatim and
 * keep their tests — they are the same arithmetic the phone uses, and two
 * implementations of "how long is this" would disagree at the boundary.
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
 * The one locale every date in the UI is formatted in.
 *
 * `en-US` explicitly, not the runtime default: the product is sold in one
 * language, and a date that renders as `31/10/2026` on one machine and
 * `10/31/2026` on another is a screenshot that cannot be trusted.
 */
const LOCALE = "en-US";

/**
 * How long ago something happened, in the words a person would use.
 *
 * `now` is a parameter rather than a `Date.now()` read so the function stays
 * pure and testable, and so a list of rows cannot get two different answers for
 * the same instant. (Ported reasoning, unchanged.)
 *
 * Anything older than a week falls back to a date, because "23 days ago" is less
 * useful than the day itself once the distance stops being the point.
 */
export function formatRelativeTime(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return "Never";
  }

  const elapsed = now - timestamp;

  // A clock that is behind, or an event recorded in the future, is not
  // "negative time ago" — it is almost always a device clock change.
  if (elapsed < 0 || elapsed < 45_000) {
    return "Just now";
  }

  const minutes = Math.floor(elapsed / MINUTE);
  if (minutes < 60) {
    return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  }

  const hours = Math.floor(elapsed / HOUR);
  if (hours < 24) {
    return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days < 7) {
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }

  return formatDate(timestamp);
}

/** A calendar date: `October 31, 2026`. */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
}

/** A date and a clock time, for a session's start. */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/** The short day label above a history group: `October 14`. */
export function formatDayHeading(timestamp: number): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", day: "numeric" }).format(
    new Date(timestamp),
  );
}

/**
 * A clock time in the listener's day: `09:15`.
 *
 * A separate function from `formatClock`, which formats a *duration* as
 * `m:ss`/`h:mm:ss`. `hour12: false` is explicit: with the default the same
 * moment prints `9:15 AM`, which is a time of day and not a column entry, and it
 * would not line up with the one below it.
 */
export function formatTimeOfDay(timestamp: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * The year of a timestamp: `2026`.
 *
 * Used only where a year is needed to disambiguate — a history heading from a
 * previous year. `formatDate` already carries it, but a heading is short by
 * design and prints the year as a suffix rather than in the middle.
 */
export function formatYear(timestamp: number): string {
  return new Intl.DateTimeFormat(LOCALE, { year: "numeric" }).format(new Date(timestamp));
}

/**
 * Reads a run of digits from the right: the last two are seconds, the next two
 * minutes, and the rest hours. `"1234"` is 12:34, not 1,234 seconds.
 *
 * A timecode is typed smallest unit first, so a jump-to-time field can accept
 * `"90"`, `"1234"` and `"123456"` without a separator being typed at all.
 * Anything that is not a digit is ignored, which lets someone paste `"12:34"`
 * and get the time they meant.
 *
 * Persian and Arabic-Indic digits are mapped first, and this is not a leftover:
 * the catalogue is Persian audio, so a listener with a Persian keyboard may type
 * `۱۲۳۴`, and `\D` would strip every one of them.
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
