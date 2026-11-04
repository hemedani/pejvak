/**
 * The admin list wrapper.
 *
 * Admin acts return `{ rows, total, page, limit }`, unlike the listener lists
 * which return a bare array (there is no total to render there). The wrapper is
 * the server's; this module only decodes it and drops a row that cannot be
 * identified rather than rendering a blank one.
 */

import { asArray, asNumber, asRecord } from "@/lib/parse";

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  limit: number;
};

export function parsePaged<T>(
  raw: unknown,
  parseRow: (row: unknown) => T | null,
): Paged<T> {
  const record = asRecord(raw);

  if (!record) {
    return { rows: [], total: 0, page: 1, limit: 0 };
  }

  const rows = asArray(record.rows)
    .map(parseRow)
    .filter((row): row is T => row !== null);

  const limit = asNumber(record.limit) ?? 0;
  const total = asNumber(record.total) ?? rows.length;

  return {
    rows,
    total,
    page: asNumber(record.page) ?? 1,
    limit,
  };
}

/** A count of pages that is never zero and never promises one past the end. */
export function pageCount(total: number, limit: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(limit) || limit <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(total / limit));
}

/** Reads a positive whole number from a query string, clamped to a range. */
export function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

/**
 * A string from a repeated query parameter.
 *
 * Next hands a repeated parameter over as an array; the first value is the one
 * the UI rendered and the one a filter should honour.
 */
export function firstValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.trim() !== "" ? first.trim() : undefined;
}
