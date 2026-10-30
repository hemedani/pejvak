/**
 * Formatting, in the listener's language.
 *
 * Two rules run through every function here:
 *
 *   1. **Persian digits.** `fa()` is applied at the *edge*, when a value becomes
 *      a string — never to a number being computed with. A number that has been
 *      through `fa()` is a string, and the next `+` on it silently concatenates.
 *   2. **Integer seconds.** Every duration arrives as integer seconds (the
 *      model's rule) and is formatted from there. Nothing here accepts a float,
 *      because a float in means drift out over twenty hours of audiobook.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

/** `"1403"` → `"۱۴۰۳"`. Leaves everything that is not an ASCII digit alone. */
export function fa(value: string | number): string {
  let out = "";
  for (const char of String(value)) {
    const code = char.charCodeAt(0);
    out += code >= 48 && code <= 57 ? PERSIAN_DIGITS[code - 48] : char;
  }
  return out;
}

/** Persian thousands separator — `۱۲٬۳۴۵`, not `12,345`. */
export function faNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("fa-IR", options).format(value);
}

const MINUTE_SEC = 60;
const HOUR_SEC = 60 * MINUTE_SEC;

/**
 * A span of listening, in words.
 *
 * This is not `formatClock`. A clock is read at a glance next to a scrubber; a
 * total is read as a sentence ("۴۱ ساعت و ۲۰ دقیقه"). Using the clock for both
 * produced `41:20:00` in a stat cell, which reads as a timestamp rather than a
 * quantity.
 *
 * Under a minute is stated rather than rounded to `۰`, because `۰ دقیقه` beside
 * "listen time" reads as "you have never listened".
 */
export function formatSpan(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));

  if (seconds === 0) {
    return "بدون شنیدن";
  }
  if (seconds < MINUTE_SEC) {
    return "کمتر از یک دقیقه";
  }
  if (seconds < HOUR_SEC) {
    const minutes = Math.floor(seconds / MINUTE_SEC);
    return `${fa(minutes)} دقیقه`;
  }

  const hours = Math.floor(seconds / HOUR_SEC);
  const minutes = Math.floor((seconds % HOUR_SEC) / MINUTE_SEC);

  // Minutes are dropped past ten hours: at that scale "۴۱ ساعت و ۳ دقیقه" is
  // noise, and the cell has to stay one line.
  if (hours >= 10 || minutes === 0) {
    return `${fa(hours)} ساعت`;
  }
  return `${fa(hours)} ساعت و ${fa(minutes)} دقیقه`;
}

/** A clock reading with Persian digits: `۱۲:۳۴`. */
export function formatClockFa(totalSec: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  const text = hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  return fa(text);
}

const BYTE_UNITS = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت", "ترابایت"] as const;

/** `1536` → `"۱٫۵ کیلوبایت"`. */
export function formatBytes(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1024) {
    return `${fa(Math.round(safe))} بایت`;
  }

  let value = safe;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // One decimal below 10, none above: "۹٫۴ مگابایت" is useful, "۹۴۳٫۲ مگابایت"
  // is not.
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const label = BYTE_UNITS[unit] ?? BYTE_UNITS[BYTE_UNITS.length - 1];

  // The decimal separator is `٫` (U+066B), not `.`. A Latin full stop inside a
  // Persian number reads as the end of a sentence.
  return `${fa(String(rounded).replace(".", "٫"))} ${label}`;
}

/** `0.42` → `"۴۲٪"`. */
export function formatPercent(ratio: number): string {
  const safe = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return `${fa(Math.round(safe * 100))}٪`;
}

/**
 * A playback speed: `1` → `"۱×"`, `1.5` → `"۱٫۵×"`.
 *
 * The `×` rather than "برابر" because it sits in a dense caption next to a
 * duration, and because a speed is a multiplier. The decimal separator is `٫`
 * (U+066B) for the same reason as in `formatBytes`: a Latin full stop inside a
 * Persian number reads as the end of a sentence.
 *
 * Whole speeds drop the decimal — `۲٫۰×` looks like a measurement with a
 * precision that is not there.
 */
export function formatSpeed(speed: number): string {
  const safe = Number.isFinite(speed) && speed > 0 ? speed : 1;
  if (Number.isInteger(safe)) {
    return `${fa(safe)}×`;
  }
  return `${fa(safe.toFixed(1).replace(".", "٫"))}×`;
}

/**
 * A count with its noun, in the form Persian actually uses.
 *
 * Persian does not inflect a noun for plural after a number — `۳ کتاب` is
 * correct and `۳ کتابها` is not — so there is no plural branch to write. This
 * exists so that "how many" is formatted in one place rather than in each
 * screen that needs it.
 */
export function formatCount(count: number, noun: string): string {
  return `${faNumber(Math.max(0, Math.floor(count)))} ${noun}`;
}

/** Trims a title to fit a table cell without cutting a word in half. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
