/**
 * A date range, as the History screen understands it.
 *
 * The screen asks one question — "when did this listen happen?" — and it is
 * asked with timestamps, not dates: a session starts at 23:58 and ends after
 * midnight, and a range that compared dates as strings would put it on the
 * wrong side of a boundary. So every range is a pair of inclusive millisecond
 * bounds, with `from` at the first millisecond of its day and `to` at the last.
 *
 * A bound may be absent. "Since March" is a real thing to ask for, and so is
 * "before I moved house", and neither needs the other end invented.
 *
 * Parsing is deliberately forgiving about *spelling* and strict about *meaning*:
 * `۱۴۰۳-۰۵-۱۲` and `1403/05/12` are the same day, and `2026-02-31` is not a day
 * at all. The digits go through the same fold the search uses, because a date
 * typed on a Persian keyboard arrives with Persian digits and a parser that only
 * accepts ASCII would call it invalid.
 */

import { foldText } from "@/lib/search";

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

/** `2026-03-09` — the form the field accepts and the form it shows back. */
export function formatDateInput(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Writes a date back as it is typed: `20260309` becomes `2026-03-09`.
 *
 * The field asks for a numeric keypad, because a date is eight digits and the
 * pad is the fastest way to give them — but that keypad has no dash key, so the
 * separator has to be supplied. `previous` is what makes backspace behave: a
 * keypress that only removed a separator would be undone by the very next
 * reformat, and the key would look dead.
 */
export function formatDateTyping(next: string, previous = ""): string {
  let digits = foldText(next).replace(/\D/g, "").slice(0, 8);
  if (removedSeparatorIndex(previous, next) >= 0) {
    // The keypress only deleted a dash. Re-inserting it unchanged would make
    // the key look dead, so the date shortens by one digit instead — the same
    // thing a backspace at the end of the field does.
    digits = digits.slice(0, -1);
  }
  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** Where a one-character deletion happened, when that character was `-` or `/`. */
function removedSeparatorIndex(previous: string, next: string): number {
  if (next.length !== previous.length - 1) {
    return -1;
  }
  let index = 0;
  while (index < next.length && previous[index] === next[index]) {
    index += 1;
  }
  const removed = previous[index];
  return removed === "-" || removed === "/" ? index : -1;
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

export type ParsedDate = {
  /** Start of the day named, or null when the field is empty. */
  value: number | null;
  /** What is wrong with it, or null. An empty field is not an error. */
  error: string | null;
};

/**
 * Reads a typed date as the start of that day.
 *
 * Accepts `YYYY-MM-DD`, `YYYY/MM/DD` and the eight bare digits the numeric
 * keypad produces, with ASCII, Persian or Arabic-Indic digits. A day that does
 * not exist is rejected rather than rolled over: `new Date("2026-02-31")` would
 * silently become 3 March, and a range that quietly moved is worse than one
 * that says it could not read the date.
 */
export function parseDateInput(text: string): ParsedDate {
  const trimmed = foldText(text).trim();
  if (trimmed.length === 0) {
    return { value: null, error: null };
  }
  const match =
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed) ??
    /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (!match) {
    return { value: null, error: "Use a date like 2026-03-09" };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { value: null, error: "That date does not exist" };
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { value: null, error: "That date does not exist" };
  }
  return { value: startOfDay(date.getTime()), error: null };
}

/**
 * A range built from two typed dates, with the end inclusive.
 *
 * Returns the error to show rather than a half-built range: a start after the
 * end would filter everything out and look like "no history", which is a much
 * worse message than "the start date is after the end date".
 */
export function rangeFromInputs(
  fromText: string,
  toText: string,
): { range: DateRange; error: string | null } {
  const from = parseDateInput(fromText);
  const to = parseDateInput(toText);
  const error = from.error ?? to.error;
  if (error) {
    return { range: ANY_DATE, error };
  }
  if (from.value !== null && to.value !== null && from.value > to.value) {
    return { range: ANY_DATE, error: "The start date is after the end date" };
  }
  return {
    range: {
      from: from.value,
      to: to.value === null ? null : endOfDay(to.value),
    },
    error: null,
  };
}
