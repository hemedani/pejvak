/**
 * Formatting, in the listener's language.
 *
 * The web app is English-only, like the phone app (D10): the product ships to the
 * global store, so there is one locale rather than a switch. That decision is
 * what these functions encode — Latin digits, English unit words, a full stop as
 * the decimal separator.
 *
 * Two rules run through every function here:
 *
 *   1. **Numbers are formatted at the edge**, when a value becomes a string —
 *      never on a number being computed with. `formatNumber` returns a string,
 *      and the next `+` on it silently concatenates.
 *   2. **Integer seconds.** Every duration arrives as integer seconds (the
 *      model's rule) and is formatted from there. Nothing here accepts a float,
 *      because a float in means drift out over twenty hours of audiobook.
 */

const LOCALE = "en-US";

/**
 * A number with grouping: `12345` → `"12,345"`.
 *
 * `en-US` explicitly rather than the runtime's default locale: a stat cell must
 * not render `12.345` on one machine and `12,345` on another, and a screenshot
 * in a store listing has to match what the reviewer sees.
 */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(LOCALE, options).format(safe);
}

const MINUTE_SEC = 60;
const HOUR_SEC = 60 * MINUTE_SEC;

/**
 * A span of listening, in words.
 *
 * This is not a clock. A clock is read at a glance next to a scrubber; a total is
 * read as a sentence ("41 hr 20 min"). Using the clock for both produced
 * `41:20:00` in a stat cell, which reads as a timestamp rather than a quantity.
 *
 * Under a minute is stated rather than rounded to `0 min`, because `0 min` beside
 * "listen time" reads as "you have never listened".
 */
export function formatSpan(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));

  if (seconds === 0) {
    return "No listening";
  }
  if (seconds < MINUTE_SEC) {
    return "Under a minute";
  }
  if (seconds < HOUR_SEC) {
    return `${Math.floor(seconds / MINUTE_SEC)} min`;
  }

  const hours = Math.floor(seconds / HOUR_SEC);
  const minutes = Math.floor((seconds % HOUR_SEC) / MINUTE_SEC);

  // Minutes are dropped past ten hours: at that scale "41 hr 3 min" is noise,
  // and the cell has to stay one line.
  if (hours >= 10 || minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** `1536` → `"1.5 KB"`. */
export function formatBytes(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1024) {
    return `${Math.round(safe)} B`;
  }

  let value = safe;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // One decimal below 10, none above: "9.4 MB" is useful, "943.2 MB" is not.
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const label = BYTE_UNITS[unit] ?? BYTE_UNITS[BYTE_UNITS.length - 1];
  return `${rounded} ${label}`;
}

/** `0.42` → `"42%"`. */
export function formatPercent(ratio: number): string {
  const safe = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return `${Math.round(safe * 100)}%`;
}

/**
 * A playback speed: `1` → `"1×"`, `1.5` → `"1.5×"`, `0.75` → `"0.75×"`.
 *
 * The `×` rather than "times" because it sits in a dense caption next to a
 * duration, and because a speed is a multiplier. Whole speeds drop the decimal —
 * `2.0×` looks like a measurement with a precision that is not there.
 *
 * **Two decimals, then trailing zeros stripped.** One decimal was wrong for the
 * quarter steps this app actually offers: `(0.75).toFixed(1)` is `"0.8"` and
 * `(1.25).toFixed(1)` is `"1.3"`, so the speed menu labelled 0.75× as 0.8× and
 * 1.25× as 1.3× — a label naming a rate the player was not running at. Rounding
 * through `Number` is what removes the zeros, so `1` stays `"1"` and `1.5` stays
 * `"1.5"` without a special case for whole numbers.
 */
export function formatSpeed(speed: number): string {
  const safe = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return `${Number(safe.toFixed(2))}×`;
}

/**
 * A count with its noun, inflected for English.
 *
 * English *does* inflect after a number, which is the one place this differs from
 * the phone's Persian-era helper: `1 track` and `3 tracks` are both correct and
 * neither is derived from the other. The plural is a parameter because "1 listen"
 * and "1 series" have plurals that no suffix rule gets right.
 */
export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return `${formatNumber(safe)} ${safe === 1 ? singular : plural}`;
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
