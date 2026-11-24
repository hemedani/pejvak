import { type Document } from "lesan";

/**
 * Shared helpers for the public browse acts.
 *
 * Kept local to the channels domain rather than imported from `src/admin/`:
 * these reads are anonymous and must not reach into the operator panel's module
 * graph. They mirror the admin helpers exactly — escape-before-regex and a
 * clamped page — because the same two mistakes (a `(` that throws, an unbounded
 * `limit`) apply to a search box the whole internet can hit.
 */

/** Escapes a user-supplied search before it becomes a regex. */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive substring match across `fields`, or `undefined`. */
export const textFilter = (
  search: string | undefined,
  fields: string[],
): Document | undefined => {
  if (!search || search.trim() === "") return undefined;
  const pattern = escapeRegex(search.trim());
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: pattern, $options: "i" },
    })),
  };
};

/** Clamped page/limit/skip for the `{ rows, total, page, limit }` wrapper. */
export const pageArgs = (page?: number, limit?: number) => {
  const safeLimit = Math.min(Math.max(Math.trunc(limit ?? 50), 1), 200);
  const safePage = Math.max(Math.trunc(page ?? 1), 1);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};
