/**
 * A date range, as the History and Notes screens understand it.
 *
 * The screen asks one question — "when did this happen?" — and it is asked with
 * timestamps, not dates: a session starts at 23:58 and ends after midnight, and
 * a range that compared dates as strings would put it on the wrong side of a
 * boundary. So every range is a pair of inclusive millisecond bounds, with
 * `from` at the first millisecond of its day and `to` at the last.
 *
 * A bound may be absent. "Since March" is a real thing to ask for, and so is
 * "before I moved house", and neither needs the other end invented.
 *
 * Nothing here parses a typed date any more — the screens choose days from the
 * system calendar (see `components/ui/date-field`) — so this module is now only
 * about what a range *means*.
 */

export type DateRange = {
  /** First millisecond of the earliest day, or null for no lower bound. */
  from: number | null;
  /** Last millisecond of the latest day, or null for no upper bound. */
  to: number | null;
};

export const ANY_DATE: DateRange = { from: null, to: null };

export type DatePreset = "any" | "today" | "week" | "month" | "year" | "custom";

/** The quick answers the sheet offers, in the order it offers them. */
export const DATE_PRESETS: readonly { value: DatePreset; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** Whether a range constrains anything at all. */
export function isRangeActive(range: DateRange): boolean {
  return range.from !== null || range.to !== null;
}

/** Inclusive on both ends — a listen at 23:59 on the last day still counts. */
export function rangeContains(range: DateRange, timestamp: number): boolean {
  if (range.from !== null && timestamp < range.from) {
    return false;
  }
  if (range.to !== null && timestamp > range.to) {
    return false;
  }
  return true;
}

/**
 * The range a preset stands for, resolved against `now`.
 *
 * The rolling presets count *today* as one of their days: "7 days" is today and
 * the six before it, not today and the seven before it. Otherwise the label and
 * the number of days the listener counts in their own history disagree.
 */
export function presetRange(
  preset: Exclude<DatePreset, "custom">,
  now: number = Date.now(),
): DateRange {
  switch (preset) {
    case "any":
      return ANY_DATE;
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "week":
      return { from: startOfDay(now - 6 * DAY_MS), to: endOfDay(now) };
    case "month":
      return { from: startOfDay(now - 29 * DAY_MS), to: endOfDay(now) };
    case "year": {
      const date = new Date(now);
      date.setMonth(0, 1);
      return { from: startOfDay(date.getTime()), to: endOfDay(now) };
    }
  }
}

/** Which preset a range looks like, for a control that has to show a state. */
export function presetForRange(range: DateRange, now: number = Date.now()): DatePreset {
  if (!isRangeActive(range)) {
    return "any";
  }
  const known: Exclude<DatePreset, "custom">[] = ["today", "week", "month", "year"];
  for (const preset of known) {
    const candidate = presetRange(preset, now);
    if (candidate.from === range.from && candidate.to === range.to) {
      return preset;
    }
  }
  return "custom";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-03-09` — the form the field shows. */
export function formatDateInput(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDate(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const month = MONTHS[date.getMonth()];
  return sameYear
    ? `${date.getDate()} ${month}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * The range in words: "Any date", "9 Mar – 14 Mar", "Since 9 Mar", "Until 9 Mar".
 *
 * A single day is named once rather than twice. The year appears only when it
 * is not the current one, because a History screen is mostly about this year and
 * repeating it on every label is noise.
 */
export function describeDateRange(range: DateRange, now: number = Date.now()): string {
  if (!isRangeActive(range)) {
    return "Any date";
  }
  if (range.from !== null && range.to !== null) {
    if (startOfDay(range.from) === startOfDay(range.to)) {
      return shortDate(range.from, now);
    }
    return `${shortDate(range.from, now)} – ${shortDate(range.to, now)}`;
  }
  if (range.from !== null) {
    return `Since ${shortDate(range.from, now)}`;
  }
  return `Until ${shortDate(range.to as number, now)}`;
}
