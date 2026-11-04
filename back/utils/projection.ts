import type { Document } from "lesan";
import { coreApp } from "../mod.ts";

/**
 * A client may send `get: {}` to mean "no projection". Mongo rejects an empty
 * `$project` in an aggregation, so fall back to every safe pure field instead
 * of failing the request. A non-empty projection is passed through untouched.
 */
export const projectionOrPure = (
  get: Document | undefined,
  schema: string,
): Document =>
  get && Object.keys(get).length > 0
    ? get
    : coreApp.schemas.createProjection(schema, "Pure");

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Applies a `get` allow-list to an already-computed response.
 *
 * Database reads can pass `get` straight to Mongo, but aggregations and
 * derived responses (quotas, entitlement blocks, analytics) are assembled in
 * code. Without this filter those acts would accept a projection and ignore
 * it, which is why the generated types and the wire format disagreed.
 *
 * An absent or empty `get` returns the value untouched. `ObjectId`, dates and
 * other class instances are leaves, so `{ _id: 1 }` keeps the id as it is.
 */
export const pickByGet = <T>(value: T, get?: Document): T => {
  if (!get || Object.keys(get).length === 0) return value;

  if (Array.isArray(value)) {
    return value.map((item) => pickByGet(item, get)) as T;
  }

  if (!isPlainObject(value)) return value;

  const projected: Record<string, unknown> = {};
  for (const [key, selector] of Object.entries(get)) {
    if (!selector) continue;
    if (!(key in value)) continue;

    const child = (value as Record<string, unknown>)[key];
    projected[key] = typeof selector === "object" && selector !== null
      ? pickByGet(child, selector as Document)
      : child;
  }

  return projected as T;
};
