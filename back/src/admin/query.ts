import { defaulted, enums, number, object, optional } from "lesan";

/**
 * Admin tables page differently from the listener lists: they need a total, and
 * 25 rows is a screenful where 50 is a scroll. The listener acts keep their
 * bare-array convention; these return `{ rows, total, page, limit }`.
 */
export const adminPagination = {
  page: optional(defaulted(number(), 1)),
  limit: optional(defaulted(number(), 25)),
};

export const pageArgs = (page?: number, limit?: number) => {
  const safeLimit = Math.min(Math.max(Math.trunc(limit ?? 25), 1), 200);
  const safePage = Math.max(Math.trunc(page ?? 1), 1);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

/**
 * The user fields an admin may see, and the only ones a projection can ask for.
 *
 * This is an allow-list rather than "everything except the password": an
 * inclusion projection built from an arbitrary `get` could ask for `password`
 * (the schema's `excludes` only applies to relations, not to a direct read), and
 * an exclusion projection would return every other field. Filtering the request
 * through a known list is the only shape that cannot leak.
 */
export const SAFE_USER_FIELDS = [
  "_id",
  "username",
  "email",
  "displayName",
  "avatarUrl",
  "role",
  "status",
  "suspendedAt",
  "suspendedReason",
  "setting",
  "createdAt",
  "updatedAt",
] as const;

/**
 * The validator side of `safeUserProjection`.
 *
 * `selectStruct("user", 1)` advertises `password` and every relation because a
 * schema does not know which fields an act is allowed to return. Deriving the
 * projection struct from the same allow-list keeps the generated `get` type
 * and the runtime filter in agreement.
 */
export const safeUserStruct = () => {
  const fields = Object.fromEntries(
    SAFE_USER_FIELDS.map((field) => [field, optional(enums([0, 1]))] as const),
  );
  return object(fields);
};

export const safeUserProjection = (
  get?: Record<string, unknown>,
): Record<string, 1> => {
  const requested = Object.keys(get ?? {}).filter((key) =>
    (SAFE_USER_FIELDS as readonly string[]).includes(key)
  );

  const keys = requested.length > 0 ? requested : [...SAFE_USER_FIELDS];
  const projection: Record<string, 1> = {};
  for (const key of keys) projection[key] = 1;
  projection._id = 1;

  return projection;
};

/**
 * Escapes a user-supplied search before it becomes a regex.
 *
 * Without this, `(` typed into the search box is an invalid pattern that throws,
 * and `.*` scans the collection. The panel's search is a substring match, not a
 * query language.
 */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const textFilter = (
  search: string | undefined,
  fields: string[],
): Record<string, unknown> | undefined => {
  if (!search || search.trim() === "") return undefined;

  const pattern = escapeRegex(search.trim());
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: pattern, $options: "i" },
    })),
  };
};

export const rangeFilter = (
  field: string,
  from?: number,
  to?: number,
): Record<string, unknown> | undefined => {
  if (from === undefined && to === undefined) return undefined;

  const range: Record<string, number> = {};
  if (from !== undefined) range.$gte = from;
  if (to !== undefined) range.$lte = to;
  return { [field]: range };
};
