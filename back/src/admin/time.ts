export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Floor to the UTC day. Buckets are UTC everywhere so a report cannot shift. */
export const startOfUtcDay = (timestamp: number): number =>
  Math.floor(timestamp / DAY_MS) * DAY_MS;

/** `2026-11-03` — the key a timeseries point is grouped by. */
export const dayKey = (timestamp: number): string =>
  new Date(startOfUtcDay(timestamp)).toISOString().slice(0, 10);

/** Monday 00:00 UTC of the week containing `timestamp`. */
export const startOfUtcWeek = (timestamp: number): number => {
  const day = startOfUtcDay(timestamp);
  const weekday = new Date(day).getUTCDay(); // 0 = Sunday
  return day - ((weekday + 6) % 7) * DAY_MS;
};

export const daysAgo = (days: number): number => Date.now() - days * DAY_MS;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Math.trunc(value), min), max);
