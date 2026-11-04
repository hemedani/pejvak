/**
 * Build an admin URL from the current query plus overrides.
 *
 * Filters, sort and page all live in the URL, so a link that changes one must
 * carry the others. Doing this by hand at each call site is how a page number
 * silently drops the search term.
 */

import { firstParam } from "@/lib/search-params";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function toQuery(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string> = {},
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const first = firstParam(value);
    if (first !== undefined && first !== "") {
      query.set(key, first);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") {
      query.delete(key);
    } else {
      query.set(key, value);
    }
  }

  return query.toString();
}

/** A single query value, or `undefined` when it was absent or empty. */
export function param(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = firstParam(params[key]);
  return value && value.trim() !== "" ? value.trim() : undefined;
}
