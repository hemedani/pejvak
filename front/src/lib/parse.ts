/**
 * Decoders for the wire boundary.
 *
 * The backend answers with JSON, and JSON is `unknown` no matter what the
 * generated types say about the *request*: `get` is a projection of `0 | 1`
 * leaves, so the response has a shape derived from the projection, but the
 * declarations only describe which keys may be asked for — not what comes back
 * in them. Casting the response with `as` would compile and be wrong the first
 * time a field is renamed on the server.
 *
 * So every act result is walked once, here, into a real type. A missing or
 * mistyped field becomes `null` at the boundary — one place to look — instead of
 * `undefined` rendered as the string "undefined" somewhere in a table.
 */

export type Json = Record<string, unknown>;

export function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A string, or `null` when absent. Never `""` — an empty title is a missing title. */
export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A finite number, or `null`. Guards against `NaN` and the string "12". */
export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** An integer second count. Anything fractional is rounded at the boundary. */
export function asInt(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * Epoch milliseconds from the backend.
 *
 * Lesan stores `startedAt` as a number, but a `createdAt` written by Mongoose is
 * a `Date` and arrives as an ISO string over JSON. Both are accepted, because a
 * screen that shows "3 hours ago" should not care which one it got.
 */
export function asTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Reads `key` off a record, tolerating a non-record. */
export function field(source: unknown, key: string): unknown {
  return asRecord(source)?.[key];
}

export function stringField(source: unknown, key: string): string | null {
  return asString(field(source, key));
}

export function numberField(source: unknown, key: string): number | null {
  return asNumber(field(source, key));
}

export function intField(source: unknown, key: string): number | null {
  return asInt(field(source, key));
}
