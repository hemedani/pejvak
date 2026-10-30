/**
 * Reading a Next.js `searchParams` value.
 *
 * A query parameter can appear more than once (`?page=2&page=3`), and Next hands
 * that back as `string[]`. Every screen in this app treats a repeated parameter
 * as "the first one wins" — not as an error and not as a joined string — so the
 * rule lives in one place instead of being re-decided by each page.
 */

export type SearchParamValue = string | string[] | undefined;

export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A page number from the URL, clamped to `>= 1`.
 *
 * `NaN` — which is what `parseInt("abc")` returns — becomes page one rather than
 * reaching an act as a number the validator will reject. A URL is user input;
 * a hand-typed `?page=abc` should show the first page, not an error state.
 */
export function pageParam(value: SearchParamValue, fallback = 1): number {
  const parsed = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
